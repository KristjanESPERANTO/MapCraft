import https from 'https';
import http from 'http';

async function testASM() {
  try {
    console.log('Testing ASM in Node.js...');

    // Test the meta API
    const metaUrl = 'https://www.geoboundaries.org/api/current/gbOpen/ASM/ADM0/';
    console.log('Fetching meta:', metaUrl);

    const metaData = await fetchJson(metaUrl);
    console.log('Meta response:', metaData);

    const dl = metaData.gjDownloadURL || metaData.simplifiedGeometryGeoJSON ||
               metaData.geojsonDownloadURL || metaData.geojsonURL ||
               metaData.downloadURL || metaData.tjDownloadURL;

    console.log('Download URL:', dl);

    if (!dl) {
      throw new Error('No download URL found');
    }

    // Test the GeoJSON download
    console.log('Fetching GeoJSON...');
    const geoJsonData = await fetchJsonRaw(dl);
    console.log('Raw response length:', geoJsonData.length);
    console.log('Raw response starts with:', geoJsonData.substring(0, 200));
    console.log('Raw response ends with:', geoJsonData.substring(geoJsonData.length - 200));
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(geoJsonData);
      console.log('GeoJSON type:', parsed.type);
      
      if (parsed.type === 'Topology') {
        console.log('Topology keys:', Object.keys(parsed.objects));
      } else if (parsed.type === 'FeatureCollection') {
        console.log('Features count:', parsed.features?.length);
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function fetchJsonRaw(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, (res) => {
      console.log('HTTP Status:', res.statusCode);
      console.log('Response headers:', res.headers);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log('Total data length received:', data.length);
        resolve(data);
      });
    });
    
    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });
    
    req.setTimeout(10000, () => {
      console.log('Request timed out');
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

testASM();
