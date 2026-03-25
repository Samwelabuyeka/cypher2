export default async function validateCryptoAddress({ record }) {
  // Only validate if crypto type and address provided
  if (record.type !== 'crypto' || !record.cryptoAddress) return;
  
  if (!record.cryptoNetwork) {
    throw new Error('Crypto network required for crypto addresses');
  }
  
  const address = record.cryptoAddress;
  const network = record.cryptoNetwork;
  
  // Basic validation - can be enhanced later
  if (network === 'bitcoin') {
    if (address.length < 26 || address.length > 35) {
      throw new Error('Invalid Bitcoin address length');
    }
  } else if (network === 'ethereum' || network === 'polygon' || network === 'bsc') {
    if (!address.startsWith('0x') || address.length !== 42) {
      throw new Error('Invalid Ethereum-compatible address');
    }
  } else if (network === 'solana') {
    if (address.length < 32 || address.length > 44) {
      throw new Error('Invalid Solana address length');
    }
  }
}