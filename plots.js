const { snapshot } = require("process-list");
const process = require('process');
const yargs = require('yargs');
const messages = require('./messageTypes');

class PlotProcessMonitor {
    constructor() {
        process.on('message', async (message) => {
            switch (message.type) {
                case messages.PRINT:
                    const plots = await this.getPlots();
                    process.send({
                        type: messages.PLOT_RESPONSE,
                        payload: plots
                    });
                    process.exit();
                    break;
            }
        });
    }

    async getPlots() {
        const processes = await snapshot();
        const screens = processes.filter(proc => proc.name === 'screen' && proc.cmdline.includes('chia plots create'));

        let plots = {};

        for (const screen of screens) {
            const splitScreen = screen.cmdline.split('&&');
            const name = yargs(splitScreen[0]).argv.S;
            const command = splitScreen[3];
            const logLocation = command.split('|')[1].split('tee ')[1];
            let argv = yargs(command).argv;
            delete argv._;
            delete argv.$0;
            plots[name] = {logLocation: logLocation, argv: argv};
        }

        for (const process of processes) {
            for (const [k, v] of Object.entries(plots)) {
                if (process.name.includes('python') && process.cmdline.includes(v.argv.t)) {
                    plots[k].process = process;
                    break;
                }
            }
        };

        return plots;
    }
}

new PlotProcessMonitor();
