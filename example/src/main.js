export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function simulateAPI() {
  await delay(500);
  return { data: 'API Response' };
}

// Legacy main function for auto-run
async function main() {
  // Example 1: Basic Promise chain
  new Promise(resolve => {
    setTimeout(() => resolve(1), 1000);
  })
  .then(v => v * 2)
  .then(v => v + 1)
  .then(console.log);

  // Example 2: Error handling and recovery
  await new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Simulated error')), 1500);
  })
  .catch(e => {
    console.warn('Recovered:', e.message);
    return 'Recovered value';
  })
  .then(console.log);

  // Example 3: Parallel promises with Promise.all
  const results = await Promise.all([
    delay(2000).then(() => 'First'),
    delay(1000).then(() => 'Second'),
    delay(1500).then(() => 'Third')
  ]);
  console.log('All completed:', results);

  // Example 4: Race condition
  const winner = await Promise.race([
    delay(2000).then(() => 'Slow'),
    delay(1000).then(() => 'Fast')
  ]);
  console.log('Race winner:', winner);

  // Example 5: Async/await with error handling
  try {
    const response = await simulateAPI();
    console.log('API Success:', response);
    
    await delay(1000);
    throw new Error('Subsequent error');
  } catch (error) {
    console.error('API Error:', error.message);
  }

  // Example 6: Complex chaining
  await new Promise(resolve => setTimeout(resolve, 500))
    .then(() => simulateAPI())
    .then(async (result) => {
      await delay(800);
      return { ...result, extra: 'data' };
    })
    .then(result => console.log('Complex chain result:', result))
    .catch(console.error);

  console.log('All examples completed');
}

// Run the examples
main().catch(console.error);
