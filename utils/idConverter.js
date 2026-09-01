// Convert a MongoDB ObjectId string to space-separated 4-digit numeric chunks
export const mongoIdToNumericCode = (mongoId) => {
  const cleanId = String(mongoId || '').replace(/[^0-9a-fA-F]/g, '');
  
  const numbers = [];
  for (let i = 0; i < cleanId.length; i += 3) {
    const hex = cleanId.substring(i, i + 3);
    const decimal = parseInt(hex, 16);
    numbers.push(decimal.toString().padStart(4, '0'));
  }
  
  return numbers.join(' ');
};

// Convert space-separated numeric code chunks back to a valid MongoDB ObjectId
export const numericCodeToMongoId = (numericCode) => {
  try {
    const numbers = String(numericCode || '').trim().split(/\s+/);
    
    if (numbers.length !== 8) {
      throw new Error('Invalid numeric code format. Expected 8 groups of numbers.');
    }

    const hexParts = numbers.map(num => {
      const decimal = parseInt(num, 10);
      if (isNaN(decimal)) {
        throw new Error('Invalid number in numeric code');
      }
      const hex = decimal.toString(16);
      return hex.padStart(3, '0');
    });
    
    const objectId = hexParts.join('');
    
    if (objectId.length !== 24) {
      throw new Error('Generated ObjectId has invalid length');
    }
    
    return objectId;
  } catch (error) {
    throw new Error(`Failed to convert numeric code to ObjectId: ${error.message}`);
  }
};

export default {
  mongoIdToNumericCode,
  numericCodeToMongoId
};