const os = require('os');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

class UI {
    constructor(quitCallback) {
        this.screen = blessed.screen({
            smartCSR: true
        });
        this.screen.title = 'Plottermon - Chia Plotting Monitor';
        // this.layout = blessed.layout({
        //     parent: this.screen,
        //     top: 0,
        //     left: 0,
        //     width: '100%',
        //     height: '100%',
        //     border: 'none',
        // });

        // this.grid = new contrib.grid({rows: 12, cols: 12, screen: this.screen});

        this.plotProgressBars = {};

        this.TOTAL_MEM = os.totalmem();

        // Quit on Escape, q, or Control-C.
        this.screen.key(['escape', 'q', 'C-c'], function (ch, key) {
            if (quitCallback && typeof quitCallback === 'function') quitCallback();
            return process.exit(0);
        });
        
        this.init();
    }

    init() {
        this.monitorTab = this.createTab('Monitor');
        this.spawnTab = this.createTab('Create');
        this.aboutTab = this.createTab('About');
        this.initLayout();
        // this.nav = this.createNav();
        // this.monitorTab = this.createContentBox();
        // this.createTab = this.createContentBox();
        // this.aboutTab = this.createContentBox();
        // this.currentTab = {name: 'Monitor', widget: this.monitorTab};
    }

    createTab(title) {
        return (screen) => {
            const grid = new contrib.grid({rows: 12, cols: 12, screen: this.screen});
            // const box = blessed.box({content: title, top: '80%', left: '10%'});
            grid.set(0, 0, 1, 1, blessed.box, {content: title, top: '80%', left: '10%'})
        };
    }

    initLayout() {
        // Add method to carousel layout to move to specific tab
        contrib.carousel.prototype.setTab = function(index) {
            if (index > this.pages.length - 1) return;
            this.currPage = index;
            this.move();
        };

        this.layout = new contrib.carousel( [this.monitorTab, this.spawnTab, this.aboutTab]
                                        , { screen: this.screen
                                        , interval: 0 //how often to switch views (set 0 to never swicth automatically)
                                        , controlKeys: true  //should right and left keyboard arrows control view rotation
                                        });
    }

    createContentBox() {
        return blessed.layout({
            parent: this.layout,
            top: this.navContainer.abottom,
            left: 0,
            width: '100%-1',
            height: `99%-${this.navContainer.height}`,
            border: 'line'
        });
    }

    createDetailsTable() {
        return blessed.table({
            parent: this.monitorTab,
            width: '99%',
            left: 0,
            top: this.donutSeparator.abottom,
        });
    }

    updateDetailsTable(name) {
        const {argv, logLocation} = this.plots[name];
        let header = Object.keys(argv);
        let data = Object.values(argv).map(v => v.toString());
        header.push('log');
        data.push(logLocation);
        this.detailsTable.setData([
            header,
            data
        ]);
    }

    updateCpuDonut(name) {
        const cpu = this.plots[name].process.cpu;
        this.donut.setData([
            {percent: cpu, lable: 'CPU', color: 'green'}
        ]);
    }

    setProgress(name, value, title) {
        const bar = this.plotProgressBars[name];
        bar.setProgress(value);
        bar.content = title;
        this.screen.render();
    }

    createSeparator(parent, alignmentParent) {
        return blessed.line({
            parent: parent,
            width: '99%',
            left: 0,
            top: alignmentParent.abottom,
            orientation: 'horizontal',
            type: 'bg',
            ch: '-'
        });
    }

    initMonitorTab(plots) {
        let button;

        this.plots = plots;
        
        for (const [name, plot] of Object.entries(plots)) {
            const parent = button ? button : this.nav;
            button = this.createProgressDetailsButton(parent, name);
            this.plotProgressBars[name] = this.createProgressBar(button, name);
        }
        
        this.plotSeparator = this.createSeparator(this.monitorTab, button);
        this.donut = contrib.donut({
            parent: this.monitorTab,
            top: 0,
            left: 0,
            label: 'Resources',
            radius: 8,
            arcWidth: 3,
            remainColor: 'black',
            yPadding: 2,
            data: [
                {percent: 80, label: 'CPU', color: 'green'}
            ]
        });
        // this.donutSeparator = this.createSeparator(this.monitorTab, this.donut);
        // this.detailsTable = this.createDetailsTable();
    }

    createNav() {

        // this.navContainer = this.grid.set(12, 3, 12, 3, blessed.box, {
        //     top: 0,
        //     left: 0,
        //     width: '100%-1',
        //     height: 3,
        //     border: 'line',
        // });

        // this.navContainer = blessed.box({
        //     parent: this.layout,
        //     top: 0,
        //     left: 0,
        //     width: '100%-1',
        //     height: 3,
        //     border: 'line',
        // });

        return this.grid.set(0, 0, 1, 12, blessed.listbar, {
            mouse: true,
            commands: { // TODO: DRY this up
                'Monitor': {
                    keys: [1],
                    callback: () => {
                        if (this.currentTab.name === 'Monitor') return;
                        this.currentTab.name = 'Monitor';
                        this.currentTab.widget = this.monitorTab;
                    }
                },
                'Create': {
                    keys: [2],
                    callback: () => {
                        if (this.currentTab.name === 'Create') return;
                        this.currentTab.widget.toggle();
                        this.createTab.toggle();
                        this.currentTab.name = 'Create';
                        this.currentTab.widget = this.createTab;
                    }
                },
                'About': {
                    keys: [3],
                    callback: () => {
                        if (this.currentTab.name === 'About') return;
                        this.currentTab.widget.toggle();
                        this.aboutTab.toggle();
                        this.currentTab.name = 'About';
                        this.currentTab.widget = this.aboutTab;
                    }
                }
            },
            style: {
                selected: {
                    fg: 'blue'
                },
                item: {
                    fg: '#676767',
                    hover: {
                        fg: 'red'
                    }
                }
            }
        })
    }

    createProgressDetailsButton(alignParent, name) {
        const form = blessed.form({
            parent: this.monitorTab,
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

        details.on('press', () => {
            this.updateCpuDonut(name);
            // this.updateDetailsTable(name);
        });

        return form;
    }

    createProgressBar(button, name) {
        return blessed.progressbar({
            parent: this.monitorTab,
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

    draw() {
        // this.screen.append(this.layout);
        // this.screen.render();
        this.layout.start();
    }
}

module.exports = UI;