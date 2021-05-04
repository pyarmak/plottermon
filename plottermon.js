#!/usr/bin/env node
const path = require('path');
const { fork } = require('child_process');
const yargs = require('yargs');
const UI = require('./ui');
const Plots = require('./plots');
const messages = require('./messageTypes');

class Main {
  constructor() {
    this.argv = yargs
      .usage('Usage: $0 <command> [options]')
      .command('watch', 'Continuously monitor the progress of all active chia plots')
      .command('print <directory>', 'Print the current progress of all chia plots logging to files in given directory', (yargs) => {
        yargs.positional('directory', {
          describe: 'The directory where chia plotter logs are located',
          type: 'string'
        })
      })
      .example('$0 watch ~/chialogs', 'Continuously monitor the progress of all chia plots logging to files in ~/chialogs')
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
      // this.ui.initMonitorTab(plots);

      this.ui.draw();
    }

    const payload = [];
    for (const i in logs) {
      payload.push([logs[i], names[i]]);
    }

    // this.analyzer.send({
    //   type: this.command,
    //   payload: payload
    // });
  }

  checkCommands() {
    switch (this.command) {
      case "watch":
        // this.initLogAnalyzer();
        this.ui = new UI();
        this.init();
        break;
      case "print":
        this.initLogAnalyzer();
        this.init();
        break;
      default:
        console.log("[Error] Unknown command: " + this.command)
        yargs.showHelp();
        yargs.exit(1, "Unknown command");
    }
  }

  initLogAnalyzer() {
    const analyzerPath = path.resolve('logAnalyzer.js');
    const options = {
      stdio: [ 'ignore', 'inherit', 'inherit', 'ipc' ]
    };
    const parameters = [];

    this.analyzer = fork(analyzerPath, parameters, options);
  }

}
 
new Main();
