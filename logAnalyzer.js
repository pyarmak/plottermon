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

        this.stats = {};

        this.SPINNER = "◴◷◶◵";

        this.TOTAL_PROGRESS = 22;

        process.on('message', message => {
            switch (message.type) { //TODO: Sort the plots
                case messages.PRINT:
                    const promises = [];
                    this.command = 'print';
                    for (const file of message.payload) {
                        promises.push(this.processFile(...file));
                    }
                    Promise.all(promises).then(() => {
                        process.exit();
                    });
                    break;
                case messages.WATCH:
                    this.command = 'watch';
                    for (const file of message.payload) {
                        this.processFile(...file);
                    }
                    break;
            }
        });
    }

    sendStats() {
        process.send({
            type: messages.LOG_STATS,
            payload: this.stats
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

    extractPhaseStats(name, line) {
        line = line.trimStart();
        // Use a basic string operation first for performance optimization
        // String.startsWith is 2x faster than matching our regex pattern
        if (!line.startsWith('Time for phase')) return;
        const pattern = /Time for (?<phase>phase \d) = (?<time>.*?) seconds. CPU \((?<cpu>.*?)%\)/;
        const match = line.match(pattern);
        if (!match) return;
        const { phase, time, cpu } = match.groups;
        if (!this.stats[name]) this.stats[name] = {};
        if (!this.stats[name][phase]) this.stats[name][phase] = [];
        this.stats[name][phase].push({
            time: parseFloat(time),
            cpu: parseFloat(cpu)
        });
        this.sendStats();
    }

    getPlotDescriptiveStats(stats) {
        const cpuData = stats.map(v => v.cpu);
        const timeData = stats.map(v => v.time);
        const cpuStats = this.getMeanAndStandardDeviation(cpuData);
        const timeStats = this.getMeanAndStandardDeviation(timeData);
        return {
            Mean: {
                'CPU (%)': this.round(cpuStats[0]),
                'Time (s)': this.round(timeStats[0])
            },
            SD: {
                'CPU (%)': this.round(cpuStats[1]),
                'Time (s)': this.round(timeStats[1])
            }
        }
    }

    round(num) {
        return +(Math.round(num + "e+3") + "e-3");
    }

    getMeanAndStandardDeviation(array) {
        const n = array.length
        const mean = array.reduce((a, b) => a + b) / n
        const sd = Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
        return [mean, sd];
    }

    async processFile(filePath, name) {
        const fileData = fs.createReadStream(filePath, { encoding: 'utf8' });
        const initialProgress = await this.getInitialProgress(fileData.pipe(split2()), name);
        if (this.command == 'print') {
            console.log(`[${name}] Completed ${initialProgress.done} plots.`);
            console.log(`Current plot in phase ${initialProgress.phase} stage ${initialProgress.stage}/${this.PHASES[initialProgress.phase].steps}`);
            if (!this.stats[name]) return;
            for (const [phase, stats] of Object.entries(this.stats[name])) {
                console.log(`${phase} stats:`);
                let tableData = {};
                stats.forEach((v, i) => {
                    tableData[`Plots #${i+1}`] = {
                        'CPU (%)': v.cpu,
                        'Time (s)': v.time
                    }
                });
                tableData = Object.assign(tableData, this.getPlotDescriptiveStats(stats));
                console.table(tableData);
            }
        }
        else if (this.command == 'watch') {
            this.watchFileProgress(name, filePath, initialProgress);
        }
    }

    watchFileProgress(name, filePath, initialProgress) {
        let currentProgress = initialProgress;
        currentProgress.spinner = 0;

        process.send({
            type: messages.PROGRESS_UPDATE,
            payload: [
                name,
                this.calculateProgress(initialProgress),
                this.getTitle(name, currentProgress)
            ]
        });

        const tail = new TailFile(filePath);

        tail.on('tail_error', (err) => {
            console.error('TailFile had an error!', err);
            throw err;
        });

        tail.pipe(split2())
            .on('data', (line) => {
                const curPhase = currentProgress.phase;
                const res = this.parseLine(line, curPhase);
                this.extractPhaseStats(name, line);
                if (res[0] !== undefined) currentProgress.phase = res[0];
                if (res[1] !== undefined) currentProgress.stage = res[1];
                if (res[2]) currentProgress.done++;
                (currentProgress.spinner === this.SPINNER.length - 1) ? currentProgress.spinner = 0 : currentProgress.spinner++;
                process.send({
                    type: messages.PROGRESS_UPDATE,
                    payload: [
                        name,
                        this.calculateProgress(currentProgress),
                        this.getTitle(name, currentProgress)
                    ]
                });
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

    async getInitialProgress(file, name) {
        let phase, stage;
        let done = 0;
        for await (let line of file) {
            if (line.startsWith("\t")) continue;
            const res = this.parseLine(line, phase);
            this.extractPhaseStats(name, line);
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