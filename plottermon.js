#!/usr/bin/env node
const path = require('path');
const { fork } = require('child_process');
const yargs = require('yargs');
const UI = require('./ui');
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
      .example('$0 watch', 'Continuously monitor the progress of all chia plots')
      .demandCommand(1, 'No command provided. Please provide a command e.g. watch')
      .wrap(Math.min(100, yargs.terminalWidth()))
      .help('h')
      .alias('h', 'help')
      .argv;

    this.command = this.argv._[0];

    this.checkCommands();
  }

  checkCommands() {
    switch (this.command) {
      case "watch":
        this.initLogAnalyzer();
        this.initPlotProcessMonitor();
        this.ui = new UI(() => {
          this.plots.kill();
          this.analyzer.kill();
        });
        break;
      case "print":
        this.initLogAnalyzer();
        this.initPlotProcessMonitor();
        break;
      default:
        console.log("[Error] Unknown command: " + this.command)
        yargs.showHelp();
        yargs.exit(1, "Unknown command");
    }
  }

  initLogAnalyzer() {
    const analyzerPath = path.resolve(__dirname, 'logAnalyzer.js');
    const options = {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'] // ignore stdin, use parent stdout & stderr, create ipc channel
    };
    const parameters = [];

    this.analyzer = fork(analyzerPath, parameters, options);

    if (this.command == 'watch') {
      this.analyzer.on('message', message => {
        switch (message.type) {
          case messages.PROGRESS_UPDATE:
            this.ui.setProgress(...message.payload);
            break;
        }
      });
    }
  }

  initPlotProcessMonitor() {
    const monitorPath = path.resolve(__dirname, 'plotProcessMonitor.js');
    const options = {
      stdio: [ 'ignore', 'ignore', 'ignore', 'ipc' ] // ignore stdin, stdout, stderr, create ipc channel
    };
    const parameters = [];

    this.plots = fork(monitorPath, parameters, options);

    this.plots.on('message', message => {
      switch (message.type) {
        case messages.PLOT_RESPONSE:
          const plots = message.payload;

          if (this.command == 'watch') {
            this.ui.setPlots(plots);
          }

          this.analyzer.send({
            type: this.command,
            payload: this.getAnalyzerPayload(plots)
          });
          break;
      }
    });

    this.plots.send({
      type: messages.PRINT
    })
  }

  getAnalyzerPayload(plots) {
    const payload = [];
    const logs = Object.entries(plots).map(plot => plot[1].logLocation);
    const names = Object.keys(plots);

    for (const i in logs) {
      payload.push([logs[i], names[i]]);
    }

    return payload;
  }

}
 
new Main();
