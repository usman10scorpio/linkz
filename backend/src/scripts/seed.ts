import 'dotenv/config';
import mongoose from 'mongoose';
import { Seat } from '../models/Seat';

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Remove existing seats so the script is idempotent
  await Seat.deleteMany({});

  const seats = await Seat.insertMany([
    { number: 1, status: 'available' },
    { number: 2, status: 'available' },
    { number: 3, status: 'available' },
  ]);

  console.log(`Seeded ${seats.length} seats`);
  seats.forEach((s) => console.log(`  Seat ${s.number}: ${s.status} (id: ${s._id})`));

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
