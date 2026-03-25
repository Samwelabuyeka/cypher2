export default async function validateStartDate({ record }) {
  if (!record.startDate) return;
  
  const startDate = new Date(record.startDate);
  const today = new Date();
  
  // Reset to start of day
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  
  if (start < today) {
    throw new Error('Start date cannot be in the past');
  }
}