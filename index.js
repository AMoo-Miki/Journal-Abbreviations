import fs from 'node:fs';
import got from 'got';
import Parser from 'node-xml-stream';
import { execSync } from 'node:child_process';
import { titleCase } from 'title-case';

const date = new Date();
const year = date.getFullYear();

const files = [
  `https://ftp.nlm.nih.gov/projects/catpluslease/catplusbase1of4.${year}.xml`,
  `https://ftp.nlm.nih.gov/projects/catpluslease/catplusbase2of4.${year}.xml`,
  `https://ftp.nlm.nih.gov/projects/catpluslease/catplusbase3of4.${year}.xml`,
  `https://ftp.nlm.nih.gov/projects/catpluslease/catplusbase4of4.${year}.xml`,
];

for (let i = 1, month = (new Date()).getMonth() + 1; i <= month; i++)
  files.push(`https://ftp.nlm.nih.gov/projects/catpluslease/catplus.${year}${String(i).padStart(2, '0')}01.xml`);

let suffix = '';
if (process.argv.length > 2) {
  suffix = '-' + process.argv[2];
}

const filename = `journal-abbreviations${suffix}.txt`;

const writer = fs.createWriteStream(filename, { flags: 'w', autoClose: true, encoding: 'utf8'});

const dotAbbr = (abbr, title) => {
  try {
    const [, realAbbr, suffix = ''] = abbr.match(/^(.+?)(\s*\(.*\))?$/);
    return realAbbr.split(/\s+/).map(token => {
      const re = new RegExp(`${token}( |$)`, 'i');
      return token + (re.test(title) ? '' : '.');
    }).join(' ') + suffix;
  } catch (e) {
    // do nothing
  }

  return abbr;
}

const finalizeAbbrs = () => {
  try {
    execSync(`sort -o sorted-${filename} -u ${filename}`);
    execSync(`rm ${filename}`);
    execSync(`mv sorted-${filename} ${filename}`);
  } catch (e) {
    console.error('Failed to run sort:', e);
  }
};

const handleNextFile = () => {
  if (files.length === 0) {
    console.log('\nCompleted');
    writer.close();
    finalizeAbbrs();
    return;
  }

  let journal = {};
  let lastTag;

  const parser = new Parser();

  parser.on('opentag', (name) => {
    switch (name) {
      case 'NLMCatalogRecord':
        journal = {
          names: []
        };
        lastTag = undefined;
        break;

      case 'TitleMain':
      case 'MedlineTA':
      case 'TitleAlternate':
        lastTag = name;
        break;
    }
  });

  parser.on('closetag', async (name) => {
    switch (name) {
      case 'NLMCatalogRecord':
        if (journal.abbr) {
          const delimitedTitle = journal.title ? '\t' + titleCase(journal.title) : '';
          const delimitedDottedAbbr = journal.title ? '\t' + dotAbbr(journal.abbr, journal.title) : '';
          for (const name of journal.names) {
            if (name.toLowerCase() === journal.abbr.toLowerCase()) continue;
            writer.write(`${name}\t${journal.abbr}${delimitedDottedAbbr}${delimitedTitle}\n`);
            if (name.endsWith('.'))
              writer.write(`${name.replace(/\.$/, '')}\t${journal.abbr}${delimitedDottedAbbr}${delimitedTitle}\n`);
          }
        }
        journal = undefined;
        lastTag = undefined;
        break;

      case 'Title':
      case 'TitleMain':
      case 'MedlineTA':
      case 'TitleAlternate':
        lastTag = undefined;
        break;
    }
  });

  parser.on('text', text => {
    switch (lastTag) {
      case 'TitleMain':
      case 'MedlineTA':
      case 'TitleAlternate':
        const cleanText = text
          .replace(/"/g, '')
          .replace(/^\.+\s*/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();

        switch (lastTag) {
          case 'TitleMain':
            journal.title = cleanText.replace(/[.\s]+$/, '');
            journal.names.push(cleanText);
            break;

          case 'TitleAlternate':
            journal.names.push(cleanText);
            break;

          case 'MedlineTA':
            process.stdout.write('.');
            journal.abbr = cleanText;
            break;
        }
    }
  });

  parser.on('finish', () => {
    process.nextTick(handleNextFile);
  });

  const file = files.shift();
  console.log('\nStarting', file);
  got.stream(file).pipe(parser);
}

handleNextFile();