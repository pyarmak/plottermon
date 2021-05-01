#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const TailFile = require('@logdna/tail-file');
const split2 = require('split2');
const yargs = require('yargs');
const UI = require('./ui');
const Plots = require('./plots');

class Main {
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

    this.argv = yargs
      .usage('Usage: $0 <command> [options]')
      .command('watch <directory>', 'Continuously monitor the progress of all chia plots logging to files in given directory', (yargs) => {
        yargs.positional('directory', {
          describe: 'The directory where chia plotter logs are located',
          type: 'string'
        })
      })
      .command('print <directory>', 'Print the current progress of all chia plots logging to files in given directory', (yargs) => {
        yargs.positional('directory', {
          describe: 'The directory where chia plotter logs are located',
          type: 'string'
        })
      })
      .example('$0 follow ~/chialogs', 'Continuously monitor the progress of all chia plots logging to files in ~/chialogs')
      .demandCommand(1, 'No command provided. Please provide a command e.g. watch')
      .wrap(Math.min(100, yargs.terminalWidth()))
      .help('h')
      .alias('h', 'help')
      .argv;

    this.command = this.argv._[0];

    this.checkCommands();
  }

  async init() {

    const plots = await Plots.get();

    const logs = Object.entries(plots).map(plot => plot[1].logLocation);
    const names = Object.keys(plots);

    if (this.command == 'watch') {
      this.ui.initProgressBars(plots);

      this.ui.draw();
    }

    for (const i in logs) {
      this.processFile(logs[i], names[i]);
    }
  }

  checkCommands() {
    switch (this.command) {
      case "watch":
        this.ui = new UI();
        this.init();
        break;
      case "print":
        this.init();
        break;
      default:
        console.log("[Error] Unknown command: " + this.command)
        yargs.showHelp();
        yargs.exit(1, "Unknown command");
    }
  }

  parseLine(line, phase) {
    let stage;
    let done = false;
    const phasePattern = "Starting phase ";
    line = line.trimStart();
    if (line.startsWith(phasePattern)) {
      phase = parseInt(line.slice(phasePattern.length, phasePattern.length+1));
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
        if (phase == 2) stage = 8 - parseInt(line.slice(index, index+1));
        else stage = parseInt(line.slice(index, index+1));
      }
    }
    return [phase, stage, done];
  }

  calculateProgress(currentProgress) {
    const { phase, stage } = currentProgress;
    let res = this.PHASES[phase].cumprog + stage;
    return Math.round((res/this.TOTAL_PROGRESS)*100);
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
    return {phase: phase, stage: stage, done: done};
  }

  getTitle(plotName, progress) { // TODO: Add done
    const { phase, stage } = progress;
    let status = this.PHASES[phase].cumprog + stage;
    status = status.toString().padStart(2, ' ');
    return `${this.SPINNER[progress.spinner]} [${plotName} (${status}/${this.TOTAL_PROGRESS})] ${this.PHASES[phase].name}`;
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
}
 
new Main();
