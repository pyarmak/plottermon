const { snapshot } = require("process-list");
const yargs = require('yargs');

class Plots {
    static async get() {
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

module.exports = Plots;
