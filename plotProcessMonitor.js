const { snapshot } = require('process-list');
const pidusage = require('pidusage');
const process = require('process');
const yargs = require('yargs');
const messages = require('./messageTypes');

class PlotProcessMonitor { // TODO: use systeminformation instead of process-list & pidusage
    constructor() {
        this.pids = [];

        process.on('message', async (message) => {
            switch (message.type) {
                case messages.GET_PLOTS:
                    const plots = await this.getPlots();
                    process.send({
                        type: messages.PLOT_RESPONSE,
                        payload: plots
                    });
                    if (message.payload) process.exit();
                    break;
                case messages.MONITOR_PLOTTERS:
                    this.getPlotterStats();
                    this.monitorPlotterStats(message.payload);
                    break;
            }
        });
    }

    async getPlots() {
        const processes = await snapshot('pid', 'name', 'cmdline');
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

        for (const [k, v] of Object.entries(plots)) {
            const process = processes.find(process => process.name.includes('python') && process.cmdline.includes(v.argv.t));
            plots[k].process = process;
            this.pids.push(process.pid);
        }

        return plots;
    }

    async getPlotterStats() {
        const stats = await pidusage(this.pids);
        process.send({
            type: messages.PLOTTER_STATS,
            payload: stats
        });
    }

    async monitorPlotterStats(time) {
        this.interval = setTimeout(async () => {
            await this.getPlotterStats();
            this.monitorPlotterStats(time);
        }, time);
    }
}

new PlotProcessMonitor();
