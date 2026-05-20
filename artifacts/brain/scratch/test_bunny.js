const BUNNY_STORAGE_ZONE = 'brightkey-assets';
const BUNNY_STORAGE_KEY = 'e0b6fd97-bf74-4ed4-9f815a6fcf6d-19ad-4eef';

const regions = [
  { name: 'Default (Europe)', url: `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/uploads/general/test_file.txt` },
  { name: 'Singapore (Asia)', url: `https://sg.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/uploads/general/test_file.txt` },
  { name: 'New York (US East)', url: `https://ny.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/uploads/general/test_file.txt` },
  { name: 'Los Angeles (US West)', url: `https://la.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/uploads/general/test_file.txt` },
  { name: 'Sydney (Oceania)', url: `https://syd.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/uploads/general/test_file.txt` },
  { name: 'United Kingdom (UK)', url: `https://uk.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/uploads/general/test_file.txt` }
];

async function testRegions() {
  for (const region of regions) {
    console.log(`Testing region: ${region.name}...`);
    try {
      const response = await fetch(region.url, {
        method: 'PUT',
        headers: {
          'AccessKey': BUNNY_STORAGE_KEY,
          'Content-Type': 'application/octet-stream',
        },
        body: 'test content'
      });
      console.log(`Status: ${response.status} ${response.statusText}`);
      if (response.ok) {
        console.log(`SUCCESS! Region is: ${region.name}`);
        const data = await response.json();
        console.log('Response data:', data);
        return;
      } else {
        const text = await response.text();
        console.log('Error output:', text);
      }
    } catch (err) {
      console.log(`Error testing ${region.name}:`, err.message);
    }
    console.log('------------------------------------');
  }
}

testRegions();
