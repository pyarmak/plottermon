const fs = require('fs');
const process = require('process');
const split2 = require('split2');
const TailFile = require('@logdna/tail-file');
const messages = require('./messageTypes');

class LogAnalyzer {

    constructor() {
        this.PHASES = [
            {},
            { name: "Computing (phase 1/4)", steps: 7, cumprog: 0, pattern: "Computing table " },
            { name: "Backpropagating (phase 2/4)", steps: 6, cumprog: 7, pattern: "Backpropagating on table " },
            { name: "Compressing (phase 3/4)", steps: 6, cumprog: 13, pattern: "Compressing tables " },
            { name: "Writing checkpoints (phase 4/4)", steps: 1, cumprog: 20, pattern: "" },
            { name: "Copying", steps: 1, cumprog: 21, pattern: "" },
            { name: "Done", steps: 1, cumprog: 22, pattern: "" },
        ];

        this.SPINNER = "◴◷◶◵";

        this.TOTAL_PROGRESS = 22;

        process.on('message', message => {
            switch (message.type) {
                case messages.PRINT:
                    const promises = [];
                    for (const file of message.payload) {
                        this.command = 'print';
                        promises.push(this.processFile(...file));
                    }
                    Promise.all(promises).then(() => {
                        process.exit();
                    });
                    break;
            }
        });
    }

    parseLine(line, phase) {
        let stage;
        let done = false;
        const phasePattern = "Starting phase ";
        line = line.trimStart();
        if (line.startsWith(phasePattern)) {
            phase = parseInt(line.slice(phasePattern.length, phasePattern.length + 1));
            stage = 0;
        }
        else if (line.startsWith("Time for phase 4")) {
            phase = 5;
            stage = 0;
        } // Copy phase
        else if (line.startsWith("Renamed final file")) {
            phase = 6;
            stage = 0;
            done = true;
        } // Done
        else if (phase && phase < 4) {
            const pattern = this.PHASES[phase].pattern;
            const index = pattern.length;
            if (line.startsWith(pattern)) {
                if (phase == 2) stage = 8 - parseInt(line.slice(index, index + 1));
                else stage = parseInt(line.slice(index, index + 1));
            }
        }
        return [phase, stage, done];
    }

    async processFile(filePath, name) {
        const fileData = fs.createReadStream(filePath, { encoding: 'utf8' });
        const initialProgress = await this.getInitialProgress(fileData.pipe(split2()));
        if (this.command == 'print')
            console.log(`[${name}] Done ${initialProgress.done}. Current plot in phase ${initialProgress.phase} stage ${initialProgress.stage}/${this.PHASES[initialProgress.phase].steps}`);
        else if (this.command == 'watch') {
            this.watchFileProgress(name, filePath, initialProgress);
        }
    }

    watchFileProgress(name, filePath, initialProgress) {
        let currentProgress = initialProgress;
        currentProgress.spinner = 0;

        this.ui.setProgress(name, this.calculateProgress(initialProgress), this.getTitle(name, currentProgress));

        const tail = new TailFile(filePath);

        tail.on('tail_error', (err) => {
            console.error('TailFile had an error!', err);
            throw err;
        });

        tail.pipe(split2())
            .on('data', (line) => {
                const curPhase = currentProgress.phase;
                const res = this.parseLine(line, curPhase);
                if (res[0] !== undefined) currentProgress.phase = res[0];
                if (res[1] !== undefined) currentProgress.stage = res[1];
                if (res[2]) currentProgress.done++;
                (currentProgress.spinner === this.SPINNER.length - 1) ? currentProgress.spinner = 0 : currentProgress.spinner++;
                this.ui.setProgress(name, this.calculateProgress(currentProgress), this.getTitle(name, currentProgress));
            });

        tail.start().catch((err) => {
            console.error('Cannot start. Does the file exist?', err);
            throw err;
        });
    }

    calculateProgress(currentProgress) {
        const { phase, stage } = currentProgress;
        let res = this.PHASES[phase].cumprog + stage;
        return Math.round((res / this.TOTAL_PROGRESS) * 100);
    }

    async getInitialProgress(file) {
        let phase, stage;
        let done = 0;
        for await (let line of file) {
            if (line.startsWith("\t")) continue;
            const res = this.parseLine(line, phase);
            if (res[0] !== undefined) phase = res[0];
            if (res[1] !== undefined) stage = res[1];
            if (res[2]) done++;
        }
        return { phase: phase, stage: stage, done: done };
    }

    getTitle(plotName, progress) { // TODO: Add done
        const { phase, stage } = progress;
        let status = this.PHASES[phase].cumprog + stage;
        status = status.toString().padStart(2, ' ');
        return `${this.SPINNER[progress.spinner]} [${plotName} (${status}/${this.TOTAL_PROGRESS})] ${this.PHASES[phase].name}`;
    }

}

new LogAnalyzer();