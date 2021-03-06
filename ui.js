const os = require('os');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const { line } = require('blessed-contrib');

class UI {
    constructor(quitCallback) {
        this.screen = blessed.screen({
            smartCSR: true,
            dockBorders: true
        });
        this.screen.title = 'Plottermon - Chia Plotting Monitor';

        // Quit on Escape, q, or Control-C.
        this.screen.key(['escape', 'q', 'C-c'], function (ch, key) {
            if (quitCallback && typeof quitCallback === 'function') quitCallback();
            return process.exit(0);
        });
        
        this.init();
    }

    init() {
        this.state = {
            _plots: null,
            _stats: null,
            _plotStats: null,
            _plotStatsListeners: {},
            _plotsListeners: {},
            _statsListeners: {},
            plotProgressBars: {},
            currentProgress: {},
            get plotStats() {
                return this._plotStats;
            },
            set plotStats(v) {
                this._plotStats = v;
                if (Object.keys(this._plotStatsListeners).length > 0) {
                    for (const listener of Object.values(this._plotStatsListeners)) {
                        listener(v);
                    }
                }
            },
            get stats() {
                return this._stats;
            },
            set stats(v) {
                this._stats = v;
                if (Object.keys(this._statsListeners).length > 0) {
                    for (const listener of Object.values(this._statsListeners)) {
                        listener(v);
                    }
                }
            },
            get plots() {
                return this._plots;
            },
            set plots(v) {
                this._plots = v;
                if (Object.keys(this._plotsListeners).length > 0) {
                    for (const listener of Object.values(this._plotsListeners)) {
                        listener(v);
                    }
                }
            },
            addListener: function(name, type, listener) {
                this['_'+type+'Listeners'][name] = listener;
            }
        };

        this.TOTAL_MEM = os.totalmem();

        this.tabs = ['Monitor', 'Create', 'About'];
        this.currentTab = this.tabs[0];
        const pages = [];

        for (const tab of this.tabs) {
            pages.push(this.createTab(tab));
        }
        this.initLayout(pages);
        this.layout.start();
    }

    createTab(title) {
        return (screen) => {

            this.nav = this.createNav();
            screen.append(this.nav);
            this.nav.select(this.currentTabIndex());

            this.content = this.createContentBox();
            screen.append(this.content);

            if (title == 'Monitor') {
                if (this.state.plots) {
                    this.initMonitorTab(this.state.plots);
                    if (Object.keys(this.state.currentProgress).length > 0) {
                        for (const payload of Object.values(this.state.currentProgress)) {
                            this.setProgress(...payload);
                        }
                    }

                    this.screen.render();
                }
                this.state.addListener('monitor-tab', 'plots', plots => {
                    this.initMonitorTab(plots);
                    this.screen.render();
                });
            } else {
                // content.set(0, 0, 2, 2, blessed.box, {content: title});
            }
        };
    }

    createContentBox() {
        return blessed.layout({
            top: 1,
            left: 0,
            width: '100%',
            height: '100%-1',
            border: 'line'
        });
    }

    initLayout(pages) {
        // Add method to carousel layout to move to specific tab
        contrib.carousel.prototype.setTab = function(index) {
            if (index > this.pages.length - 1) return;
            this.currPage = index;
            this.move();
        };

        this.layout = new contrib.carousel(pages, {
            screen: this.screen,
            interval: 0, // How often to switch views (we set it to 0 to never swicth automatically)
            controlKeys: false, // Disable built-in right and left keyboard arrows control view rotation (we implement a better method below)
            rotate: true // Circle back to the first view when we reach the end
        });

        // Bind view rotation keys and hook them into the interactive navbar
        this.screen.key(['right', 'left', 'home', 'end'], (ch, key) => {
            if (key.name=='right') this.nextTab();
            if (key.name=='left') this.prevTab();
            if (key.name=='home') {
                this.currentTab = this.tabIndexToName(0);
                this.layout.home();
            }
            if (key.name=='end') {
                this.currentTab = this.tabIndexToName(this.tabs.length - 1);
                this.layout.end();
            }
        });
    }

    tabIndexToName(i) {
        return this.tabs[i];
    }

    tabNameToIndex(name) {
        return this.tabs.indexOf(name);
    }

    currentTabIndex() {
        return this.tabs.indexOf(this.currentTab);
    }

    nextTab() {
        let currPage = this.currentTabIndex();
        if (++currPage == this.tabs.length) this.currentTab = this.tabIndexToName(0);
        else this.currentTab = this.tabIndexToName(currPage);
        this.layout.next();
        this.nav.select(this.currentTabIndex());
    }

    prevTab() {
        let currPage = this.currentTabIndex();
        if (--currPage < 0) this.currentTab = this.tabIndexToName(this.tabs.length - 1);
        else this.currentTab = this.tabIndexToName(currPage);
        this.layout.prev();
        this.nav.select(this.currentTabIndex());
    }

    createDetailsTable(parent, top) {
        // Undo a stupid "fix" in the blessed.table _calculateMaxes function...
        // TODO: Move all of the blessed overrides into a single external file
        blessed.table.prototype._calculateMaxes = function() {
            var self = this;
            var maxes = [];

            if (this.detached) return;

            this.rows = this.rows || [];

            this.rows.forEach(function (row) {
                row.forEach(function (cell, i) {
                    var clen = self.strWidth(cell);
                    if (!maxes[i] || maxes[i] < clen) {
                        maxes[i] = clen;
                    }
                });
            });

            var total = maxes.reduce(function (total, max) {
                return total + max;
            }, 0);
            total += maxes.length + 1;

            if (this.position.width != null) {
                var missing = this.width - total;
                var w = missing / maxes.length | 0;
                var wr = missing % maxes.length;
                maxes = maxes.map(function (max, i) {
                    if (i === maxes.length - 1) {
                        return max + w + wr;
                    }
                    return max + w;
                });
            } else {
                maxes = maxes.map(function (max) {
                    return max + self.pad;
                });
            }

            return this._maxes = maxes;
        }

        return blessed.table({
            parent: parent,
            width: '99%',
            height: '100%',
            left: 0,
            align: 'center',
            top: top,
        });
    }

    updateDetailsTable(name) {
        const {argv, logLocation} = this.state.plots[name];
        let header = Object.keys(argv);
        let data = Object.values(argv).map(v => v.toString());
        header.push('log');
        data.push(logLocation);
        this.detailsTable.setData([
            header,
            data
        ]);
    }

    getDonutColor(percent) {
        if (percent > 66) return 'red';
        if (percent > 33) return 'yellow';
        return 'green';
    }

    // TODO: Make RAM donut display raw used RAM instead of percentage
    updateResourceDonuts(name) { // TODO: DRY this up
        const pid = this.state.plots[name].process.pid;
        const { cpu, memory } = this.state.stats[pid];
        const ram = this.TOTAL_MEM / memory;
        const ramLabelColor = this.getDonutColor(ram);
        const cpuLabelColor = this.getDonutColor(cpu);
        this.state.addListener('donuts', 'stats', stats => { 
            const { cpu, memory } = stats[pid];
            const ram = this.TOTAL_MEM / memory;
            const ramLabelColor = this.getDonutColor(ram);
            const cpuLabelColor = this.getDonutColor(cpu);
            this.donut.setData([
                {percent: cpu, label: 'CPU', color: cpuLabelColor},
                {percent: ram, label: 'RAM', color: ramLabelColor},
            ])
        });
        this.donut.setData([
            {percent: cpu, label: 'CPU', color: cpuLabelColor},
            {percent: ram, label: 'RAM', color: ramLabelColor},
        ]);
    }

    setProgress(name, value, title) {
        this.state.currentProgress[name] = [name, value, title];
        const bar = this.state.plotProgressBars[name];
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

        const offset = Math.round(Object.keys(plots).length / 2) + 3;

        const layout = blessed.layout({
            parent: this.screen,
            top: offset + 4,
            width: '100%',
            height: `100%-${offset + 4}`,
            left: 0,
            border: 'line',
            hidden: true,
        });

        const launchParamsBox = blessed.box({
            parent: this.screen,
            top: offset,
            width: '100%',
            height: 5,
            left: 0,
            hidden: true,
            border: 'line',
            label: 'Launch Parameters'
        });
        
        for (const [name, plot] of Object.entries(plots)) {
            const parent = button ? button : this.nav;
            button = this.createProgressDetailsButton(parent, name);
            this.state.plotProgressBars[name] = this.createProgressBar(button, name);
        }

        this.detailsTable = this.createDetailsTable(launchParamsBox, 0);
        launchParamsBox.append(this.detailsTable);

        this.plotStatsTable = this.createPlotStatsTable(layout, offset);
        layout.append(this.plotStatsTable);

        this.donut = this.createResourceDonuts(layout);
        layout.append(this.donut);

        this.screen.append(launchParamsBox);
        this.screen.append(layout);
        this.launchParamsBox = launchParamsBox;
        this.monitorTabLayout = layout;
    }

    createPlotStatsTable(parent, offset) {
        return contrib.table(
            {
                parent: parent
                , keys: false
                , fg: 'white'
                // , selectedFg: 'white'
                // , selectedBg: 'blue'
                , interactive: false
                , label: 'Stats'
                , width: 38
                , height: '100%-2'
                // , left: 31
                , top: offset + 5
                , border: { type: "line", fg: "cyan" }
                , columnSpacing: 1 //in chars
                , columnWidth: [5, 6, 12, 12] /*in chars*/
            });
    }

    updatePlotStatsTable(name) { // TODO: add descriptive stats and split by phase
        if (!this.state.plotStats || !this.state.plotStats[name]) return;
        const plotStats = this.state.plotStats[name];

        const data = [];

        for (const [phase, stats] of Object.entries(plotStats)) {
            stats.forEach((v, i) => {
                data.push([
                    i+1,
                    parseInt(phase.split(' ')[1]),
                    v.cpu,
                    v.time
                ]);
            });
        }
        this.plotStatsTable.setData({
            headers: ['Plot', 'Phase', 'CPU (%)', 'Time (s)'],
            data: data
        });
        // this.state.addListener('plot-stats-table', 'plotStats', stats => { 

        // })
    }

    createResourceDonuts(parent) {
        return contrib.donut({
            parent: parent,
            top: this.detailsTable.abottom,
            left: this.plotStatsTable.aright,
            width: 30,
            height: 10,
            radius: 8,
            arcWidth: 3,
            remainColor: 'black',
            yPadding: 2,
            hidden: true,
            data: [
                {percent: 0, label: 'CPU', color: 'green'},
                {percent: 0, label: 'RAM', color: 'red'}
            ]
        });
    }

    createNav() {
        let commands = {};

        this.tabs.forEach((name, i) => {
            commands[name] = {
                keys: [i+1],
                callback: () => {
                    if (this.currentTab === name) return;
                    this.currentTab = name;
                    this.layout.setTab(i);
                }
            }
        });

        return blessed.listbar({
            mouse: true,
            left: 0,
            top: 0,
            width: '100%',
            height: 1,
            padding: {
                left: -1
            },
            commands: commands,
            style: {
                bg: 'white',
                selected: {
                    bg: 'blue',
                    fg: 'white'
                },
                item: {
                    bg: 'white',
                    fg: 'black',
                    hover: {
                        fg: 'red'
                    }
                }
            }
        });
    }

    createProgressDetailsButton(alignParent, name) {
        const form = blessed.form({
            parent: this.content,
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

        details.on('press', () => { // TODO: Combine some of this stuff
            this.donut.show();
            this.monitorTabLayout.show();
            this.launchParamsBox.show();
            this.detailsTable.show();
            this.updateResourceDonuts(name);
            this.updateDetailsTable(name);
            this.updatePlotStatsTable(name);
        });

        return form;
    }

    createProgressBar(button, name) {
        // override default progressbar renderer to allow for truncation of long content string
        blessed.progressbar.prototype.render = function() {
            var ret = this._render();
            if (!ret) return;

            var xi = ret.xi
                , xl = ret.xl
                , yi = ret.yi
                , yl = ret.yl
                , dattr;

            if (this.border) xi++, yi++, xl--, yl--;

            if (this.orientation === 'horizontal') {
                xl = xi + ((xl - xi) * (this.filled / 100)) | 0;
            } else if (this.orientation === 'vertical') {
                yi = yi + ((yl - yi) - (((yl - yi) * (this.filled / 100)) | 0));
            }

            dattr = this.sattr(this.style.bar);

            this.screen.fillRegion(dattr, this.pch, xi, xl, yi, yl);

            if (this.content) {
                var line = this.screen.lines[yi];
                if (line) {
                    for (var i = 0; i < this.content.length; i++) {
                        if (line[xi + i] && line[xi + i][1]) line[xi + i][1] = this.content[i];
                    }
                    line.dirty = true;
                }
            }

            return ret;
        };

        return blessed.progressbar({
            parent: this.content,
            content: name,
            orientation: 'horizontal',
            top: button.atop,
            left: button.aright,
            height: 1,
            width: '50%-13',
            filled: 0,
            keys: false,
            mouse: false,
            shrink: true,
            style: {
                bg: 'gray',
                bar: {
                    bg: 'blue',
                }
            }
        });
    }

    setStats(stats) {
        this.state.stats = stats;
    }

    setPlots(plots) {
        this.state.plots = plots;
    }

    setLogStats(stats) {
        this.state.plotStats = stats;
    }

}

module.exports = UI;
