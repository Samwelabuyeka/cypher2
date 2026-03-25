export default async function validateEndDate({ record }) {
  if (!record.endDate) return;
  
  if (!record.startDate) {
    throw new Error('Start date must be set');
  }
  
  const startDate = new Date(record.startDate);
  const endDate = new Date(record.endDate);
  
  // Reset to start of day
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  
  if (endDate <= startDate) {
    throw new Error('End date must be after start date');
  }
}