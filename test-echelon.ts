async function testEchelon() {
  const url = 'https://app.echelon.market/api/markets?network=aptos_mainnet';
  const response = await fetch(url);
  const data = await response.json();
  console.log(Object.keys(data), Array.isArray(data));
  console.log("Sample:");
  console.log(JSON.stringify(data, null, 2).slice(0, 1500));
}
testEchelon().catch(console.error);
