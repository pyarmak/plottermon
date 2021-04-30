#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const cliProgress = require('cli-progress');
const TailFile = require('@logdna/tail-file');
const split2 = require('split2');

const PHASES = [
  {},
  {name: "Computing (phase 1/4)          ", steps: 7, cumprog: 0, pattern: "Computing table "},
  {name: "Backpropagating (phase 2/4)    ", steps: 6, cumprog: 7, pattern: "Backpropagating on table "},
  {name: "Compressing (phase 3/4)        ", steps: 6, cumprog: 13, pattern: "Compressing tables "},
  {name: "Writing checkpoints (phase 4/4)", steps: 1, cumprog: 20, pattern: ""},
  {name: "Copying                        ", steps: 1, cumprog: 21, pattern: ""},
  {name: "Done                           ", steps: 1, cumprog: 22, pattern: ""},
];

const SPINNER = ["🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚"];

const TOTAL_PROGRESS = 22;

const yargs = require('yargs');
const argv = yargs
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

const command = argv._[0];
const multibar = new cliProgress.MultiBar({
  format: '[{file}] {bar} {spinner} | {phase} | {value}/{total} | Done: {done}',
  hideCursor: true,
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  clearOnComplete: true,
}, cliProgress.Presets.shades_grey);
checkCommands(yargs, command);

function checkCommands (yargs, command) {
  switch (command) {
    case "watch":
    case "print":
      main();
      break;
    default:
      console.log("[Error] Unknown command: " + command)
      yargs.showHelp();
      yargs.exit(1, "Unknown command");
  }
}

function parseLine(line, phase) {
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
    const pattern = PHASES[phase].pattern;
    const index = pattern.length;
    if (line.startsWith(pattern)) {
      if (phase == 2) stage = 8 - parseInt(line.slice(index, index+1));
      else stage = parseInt(line.slice(index, index+1));
    }
  }
  return [phase, stage, done];
}

function calculateProgress(currentProgress) {
  const { phase, stage } = currentProgress;
  let res = PHASES[phase].cumprog + stage;
  return res.toString().padStart(2, ' ');
}

async function getInitialProgress(file) {
  let phase, stage;
  let done = 0;
  for await (let line of file) {
    if (line.startsWith("\t")) continue;
    const res = parseLine(line, phase);
    if (res[0] !== undefined) phase = res[0];
    if (res[1] !== undefined) stage = res[1];
    if (res[2]) done++;
  }
  return {phase: phase, stage: stage, done: done};
}

function watchFileProgress(fileName, filePath, initialProgress) {
  let currentProgress = initialProgress;
  currentProgress.spinner = 0;

  const progress = multibar.create(
    TOTAL_PROGRESS,
    calculateProgress(initialProgress),
    {
      file: fileName,
      phase: PHASES[initialProgress.phase].name,
      done: initialProgress.done,
      spinner: SPINNER[currentProgress.spinner]
    }
  );

  const tail = new TailFile(filePath);

  tail.on('tail_error', (err) => {
    console.error('TailFile had an error!', err);
    throw err;
  })
    .start()
    .catch((err) => {
      console.error('Cannot start.  Does the file exist?', err);
      throw err;
    });

  tail.pipe(split2())
    .on('data', (line) => {
      const curPhase = currentProgress.phase;
      const res = parseLine(line, curPhase);
      if (res[0] !== undefined) currentProgress.phase = res[0];
      if (res[1] !== undefined) currentProgress.stage = res[1];
      if (res[2]) currentProgress.done++;
      (currentProgress.spinner === SPINNER.length - 1) ? currentProgress.spinner = 0 : currentProgress.spinner++;
      progress.update(
        calculateProgress(currentProgress),
        { 
          phase: PHASES[currentProgress.phase].name,
          done: currentProgress.done,
          spinner: SPINNER[currentProgress.spinner]
        });
    });
}

async function processFile(file) {
  const filePath = path.join(argv.directory, file);
  const fileName = path.basename(file, '.log');
  const fileData = fs.createReadStream(filePath, { encoding: 'utf8' });
  const initialProgress = await getInitialProgress(fileData.pipe(split2()));
  if (command == 'print')
    console.log(`[${fileName}] done ${initialProgress.done}. Current plot in phase ${initialProgress.phase} stage ${initialProgress.stage}/${PHASES[initialProgress.phase].steps}`);
  else if (command == 'watch') {
    watchFileProgress(fileName, filePath, initialProgress);
  }
}

function main() {
  fs.readdir(argv.directory, (err, files) => {
    for (const file of files) {
      processFile(file);
    }
    if (command == 'watch') {
      const watcher = chokidar.watch(argv.directory, { persistent: true, ignoreInitial: true });

      watcher
        .on('add', filePath => {
          const fileName = path.basename(filePath, '.log');
          watchFileProgress(fileName, filePath, { phase: 1, stage: 0 });
        })
        .on('error', err => {
          console.error('Folder watcher error!', err);
          throw err;
        });
    }
  });
}

process.on('SIGINT', function() {
  console.log("\nCaught interrupt signal. Shutting down gracefully.");
  multibar.stop();

  process.exit();
});
