export function validateBitcoinAddress(address: string): boolean {
  return address.length >= 26 && address.length <= 35;
}

export function validateEthereumAddress(address: string): boolean {
  return address.startsWith('0x') && address.length === 42;
}

export function validateCryptoAddress(
  address: string,
  network: 'bitcoin' | 'ethereum' | 'polygon' | 'bsc' | 'solana' | 'tron'
): boolean {
  switch (network) {
    case 'bitcoin':
      return validateBitcoinAddress(address);
    case 'ethereum':
    case 'polygon':
    case 'bsc':
      return validateEthereumAddress(address);
    case 'solana':
      return address.length >= 32 && address.length <= 44;
    case 'tron':
      return address.startsWith('T') && address.length === 34;
    default:
      return false;
  }
}