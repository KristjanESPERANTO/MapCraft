import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read countries from the source file
const countriesContent = fs.readFileSync('./src/countries.ts', 'utf8');
const countriesMatch = countriesContent.match(/export const countries: Country\[\] = (\[[\s\S]*?\]);/);
if (!countriesMatch) {
  throw new Error('Could not parse countries from countries.ts');
}

const countries = eval(countriesMatch[1]);

const BASE_DIR = path.join(__dirname, 'public', 'data', 'gbOpen');
const ADM_LEVELS = ['ADM0', 'ADM1'];

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    // Use original URL and handle redirects automatically
    let finalUrl = url;
    
    console.log(`Downloading from: ${finalUrl}`);
    
    const protocol = finalUrl.startsWith('https') ? https : https; // Default to https
    const file = fs.createWriteStream(destPath);
    
    const req = protocol.get(finalUrl, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          console.log(`Redirecting to: ${redirectUrl}`);
          // Follow redirect with a new request
          protocol.get(redirectUrl, (redirectResponse) => {
            if (redirectResponse.statusCode !== 200) {
              reject(new Error(`Failed to download ${redirectUrl}: ${redirectResponse.statusCode}`));
              return;
            }
            redirectResponse.pipe(file);
            file.on('finish', () => {
              file.close();
              console.log(`Downloaded: ${destPath}`);
              resolve();
            });
          }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
          return;
        }
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${finalUrl}: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${destPath}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function downloadCountryData(iso3, admLevel) {
  const countryDir = path.join(BASE_DIR, iso3, admLevel);
  const geoJsonPath = path.join(countryDir, `geoBoundaries-${iso3}-${admLevel}.geojson`);
  const topoJsonPath = path.join(countryDir, `geoBoundaries-${iso3}-${admLevel}.topojson`);

  // Create directory if it doesn't exist
  fs.mkdirSync(countryDir, { recursive: true });

  try {
    // Get metadata from geoBoundaries API
    const metaUrl = `https://www.geoboundaries.org/api/current/gbOpen/${iso3}/${admLevel}/`;
    console.log(`Fetching metadata for ${iso3} ${admLevel}...`);

    const metaResponse = await fetch(metaUrl);
    if (!metaResponse.ok) {
      console.log(`No data available for ${iso3} ${admLevel}`);
      return;
    }

    const meta = await metaResponse.json();
    const gjUrl = meta.gjDownloadURL || meta.simplifiedGeometryGeoJSON || meta.geojsonDownloadURL || meta.geojsonURL || meta.downloadURL;
    
    // Only download GeoJSON, skip TopoJSON
    if (gjUrl) {
      try {
        console.log(`Downloading GeoJSON for ${iso3} ${admLevel}...`);
        await downloadFile(gjUrl, geoJsonPath);
      } catch (error) {
        console.log(`Failed to download GeoJSON for ${iso3} ${admLevel}:`, error.message);
      }
    } else {
      console.log(`No GeoJSON URL found for ${iso3} ${admLevel}`);
    }

  } catch (error) {
    console.log(`Error processing ${iso3} ${admLevel}:`, error.message);
  }
}

async function downloadAllCountries() {
  console.log(`Downloading all countries (ADM0 + ADM1 when available)...`);
  for (const country of countries) {
    console.log(`\nProcessing ${country.name} (${country.iso3})...`);
    for (const admLevel of ADM_LEVELS) {
      await downloadCountryData(country.iso3, admLevel);
      // Small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  console.log('\nAll downloads complete!');
}

async function downloadAsmTest() {
  console.log(`Testing download with American Samoa...`);
  const testCountries = countries.filter(c => c.iso3 === 'ASM');
  for (const country of testCountries) {
    console.log(`\nProcessing ${country.name} (${country.iso3})...`);
    for (const admLevel of ADM_LEVELS) {
      await downloadCountryData(country.iso3, admLevel);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  console.log('\nTest complete!');
}

async function downloadSingle(iso3, adm) {
  const iso = iso3.toUpperCase();
  const admLevel = adm.toUpperCase();
  console.log(`Downloading ${iso} ${admLevel}...`);
  await downloadCountryData(iso, admLevel);
  console.log('Done.');
}

// Simple CLI
const args = process.argv.slice(2);
if (args[0] === '--all') {
  downloadAllCountries().catch(console.error);
} else if (args[0] === '--single' && args[1] && args[2]) {
  downloadSingle(args[1], args[2]).catch(console.error);
} else {
  // default: ASM test
  downloadAsmTest().catch(console.error);
}
