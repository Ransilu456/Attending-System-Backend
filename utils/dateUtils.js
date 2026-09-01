// Parse multiple MongoDB date representations safely into a standard Date object
export const parseMongoDate = (mongoDate) => {
  if (!mongoDate) return null;
  
  try {
    if (mongoDate instanceof Date) {
      return mongoDate;
    }

    if (typeof mongoDate === 'object') {
      if (mongoDate.$date) {
        if (mongoDate.$date.$numberLong) {
          return new Date(parseInt(mongoDate.$date.$numberLong, 10));
        }
        if (typeof mongoDate.$date === 'string' || typeof mongoDate.$date === 'number') {
          return new Date(mongoDate.$date);
        }
      }
      
      if (mongoDate.ISODate) {
        return new Date(mongoDate.ISODate);
      }
    }
    
    if (typeof mongoDate === 'string' && mongoDate.includes('$date')) {
      try {
        const parsed = JSON.parse(mongoDate);
        if (parsed.$date) {
          return parsed.$date.$numberLong ? new Date(parseInt(parsed.$date.$numberLong, 10)) : new Date(parsed.$date);
        }
      } catch {
        // Fall back to standard date parsing
      }
    }
    
    if (typeof mongoDate === 'string' || typeof mongoDate === 'number') {
      const date = new Date(mongoDate);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  
    return null;
  } catch {
    return null;
  }
};

// Format a date object or string into localized time string
export const formatTimeFromDate = (date, options = {}) => {
  if (!date) return 'N/A';
  
  try {
    const parsedDate = parseMongoDate(date);
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return 'N/A';
    }
    
    const defaultOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    
    return parsedDate.toLocaleTimeString('en-US', { ...defaultOptions, ...options });
  } catch {
    return 'N/A';
  }
};

// Calculate elapsed human-readable duration between two dates
export const calculateDuration = (startDate, endDate) => {
  if (!startDate || !endDate) return 'N/A';
  
  try {
    const start = parseMongoDate(startDate);
    const end = parseMongoDate(endDate);
    
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return 'N/A';
    }
    
    const durationMs = end - start;
    if (durationMs <= 0) return 'N/A';
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  } catch {
    return 'N/A';
  }
};

export default {
  parseMongoDate,
  formatTimeFromDate,
  calculateDuration
};