const blessed = require('blessed');

class UI {
    constructor() {
        this.screen = blessed.screen({
            smartCSR: true
        });
        this.screen.title = 'Plottermon - Chia Plotting Monitor';
        this.layout = blessed.layout({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
        });

        this.plotProgressBars = {};

        // Quit on Escape, q, or Control-C.
        this.screen.key(['escape', 'q', 'C-c'], function (ch, key) {
            return process.exit(0);
        });
        
        this.init();
    }

    init() {
        this.nav = this.createNav();
        // this.nav = this.createForm();
        // this.table = this.createTable();
    }

    setProgress(name, value, title) {
        this.plotProgressBars[name].setProgress(value);
        this.plotProgressBars[name].content = title;
        this.screen.render();
    }

    initProgressBars(plots) {
        let button;
        for (const [name, plot] of Object.entries(plots)) {
            const parent = button ? button : this.nav;
            button = this.createOverview(parent);
            this.plotProgressBars[name] = this.createProgressBar(button, name);
        }
    }

    createNav() {
        return blessed.listbar({
            parent: this.layout,
            top: 0,
            left: 0,
            width: '100%',
            height: 2,
            commands: {
                'Overview': {
                    keys: [1],
                    callback: () => {}
                },
                'Details': {
                    keys: [2],
                    callback: () => {}
                }
            }
        })
    }

    createOverview(alignParent) {
        const form = blessed.form({
            parent: this.layout,
            keys: true,
            top: alignParent.abottom,
            left: 0,
            width: 11,
            height: 1,
            padding: {
                left: 1,
                right: 1
            }
        });

        const details = blessed.button({
            parent: form,
            mouse: true,
            keys: true,
            shrink: false,
            left: 0,
            top: 0,
            padding: {
                left: 1,
                right: 1
            },
            name: 'details',
            content: 'Details',
            style: {
                bg: 'blue',
                focus: {
                    bg: 'red'
                },
                hover: {
                    bg: 'red'
                }
            }
        });

        return form;
    }

    createProgressBar(button, name) {
        return blessed.progressbar({
            parent: this.layout,
            content: name,
            orientation: 'horizontal',
            top: button.atop,
            left: button.aright,
            height: 1,
            width: '50%-13',
            filled: 0,
            keys: false,
            mouse: false,
            style: {
                bg: '#676767',
                bar: {
                    bg: 'blue',
                }
            }
        });
    }

    createForm() {
        const form = blessed.form({
            parent: this.layout,
            keys: true,
            left: 0,
            top: 0,
            width: '100%',
            height: 1,
            bg: 'white',
        });

        const submit = blessed.button({
            parent: form,
            mouse: true,
            keys: true,
            shrink: true,
            padding: {
                left: 1,
                right: 1
            },
            left: 0,
            top: 0,
            shrink: true,
            name: 'submit',
            content: 'submit',
            style: {
                bg: 'blue',
                focus: {
                    bg: 'red'
                },
                hover: {
                    bg: 'red'
                }
            }
        });

        const cancel = blessed.button({
            parent: form,
            mouse: true,
            keys: true,
            shrink: true,
            padding: {
                left: 1,
                right: 1
            },
            left: 20,
            top: 0,
            shrink: true,
            name: 'cancel',
            content: 'cancel',
            style: {
                bg: 'blue',
                focus: {
                    bg: 'red'
                },
                hover: {
                    bg: 'red'
                }
            }
        });

        submit.on('press', function () {
            form.submit();
        });

        cancel.on('press', function () {
            form.reset();
        });

        form.on('submit', function (data) {
            form.setContent('Submitted.');
            this.screen.render();
        });

        form.on('reset', function (data) {
            form.setContent('Canceled.');
            this.screen.render();
        });

        return form;
    }

    draw() {
        this.screen.append(this.layout);
        // this.screen.append(this.nav);
        // this.screen.append(this.form);
        this.screen.render();
    }
}

module.exports = UI;