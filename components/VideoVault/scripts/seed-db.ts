import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { videos, directoryRoots, tags } from '../shared/videovault/schema';
import { randomUUID } from 'crypto';
// @ts-ignore - canvas is an optional dependency
import { createCanvas } from 'canvas';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
const envPath = path.resolve(__dirname, '../env/.env-app.local');
dotenv.config({ path: envPath });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
}

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/library');

/**
 * Generate a unique colored thumbnail for each video
 */
function generateUniqueThumbnail(videoNumber: number): Buffer {
    const canvas = createCanvas(320, 180);
    const ctx = canvas.getContext('2d');

    // Create a unique color based on video number
    const hue = (videoNumber * 137.508) % 360; // Golden angle for good distribution
    const saturation = 60 + (videoNumber % 40);
    const lightness = 40 + (videoNumber % 30);

    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, 320, 180);
    gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, ${saturation}%, ${lightness - 10}%)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 180);

    // Add video number text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${videoNumber}`, 160, 90);

    // Add subtle pattern for more uniqueness
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < 5; i++) {
        const x = (videoNumber * 13 + i * 50) % 320;
        const y = (videoNumber * 17 + i * 30) % 180;
        const radius = 10 + (videoNumber % 20);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    return canvas.toBuffer('image/jpeg', { quality: 0.85 });
}

/**
 * Generate a unique sprite sheet with 10 frames for each video
 */
function generateUniqueSprite(videoNumber: number): Buffer {
    const frameWidth = 160;
    const frameHeight = 90;
    const frameCount = 10;

    const canvas = createCanvas(frameWidth * frameCount, frameHeight);
    const ctx = canvas.getContext('2d');

    // Base hue for this video
    const baseHue = (videoNumber * 137.508) % 360;

    // Draw each frame with a slight variation
    for (let frame = 0; frame < frameCount; frame++) {
        const x = frame * frameWidth;

        // Vary the color for each frame
        const hue = (baseHue + frame * 10) % 360;
        const saturation = 55 + (videoNumber % 30) + frame * 2;
        const lightness = 35 + (videoNumber % 25) + frame * 3;

        // Create gradient for this frame
        const gradient = ctx.createLinearGradient(x, 0, x + frameWidth, frameHeight);
        gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
        gradient.addColorStop(1, `hsl(${(hue + 40) % 360}, ${saturation}%, ${lightness - 5}%)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(x, 0, frameWidth, frameHeight);

        // Add frame number
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${frame + 1}`, x + frameWidth / 2, frameHeight / 2);

        // Add video number in smaller text
        ctx.font = '12px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText(`#${videoNumber}`, x + frameWidth / 2, frameHeight / 2 + 25);

        // Add unique pattern per frame
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        const circleX = x + ((videoNumber * 7 + frame * 11) % frameWidth);
        const circleY = (videoNumber * 5 + frame * 13) % frameHeight;
        const radius = 5 + ((videoNumber + frame) % 15);
        ctx.beginPath();
        ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    return canvas.toBuffer('image/jpeg', { quality: 0.85 });
}

const SAMPLE_CATEGORIES = {
    age: ['18-25', '26-35', '36-50'],
    physical: ['Slim', 'Athletic', 'Curvy'],
    ethnicity: ['Asian', 'Black', 'Latina', 'White'],
    relationship: ['Couple', 'Solo', 'Group'],
    acts: ['Oral', 'Anal', 'Vaginal'],
    setting: ['Indoor', 'Outdoor', 'Studio'],
    quality: ['HD', '4K', 'SD'],
    performer: ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve', 'Frank']
};

function getRandomItem(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomSubset(arr: string[], max = 3) {
    const count = Math.floor(Math.random() * max) + 1;
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

async function seed() {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    const db = drizzle(client);

    console.log('Cleaning database...');
    await db.delete(videos);
    await db.delete(directoryRoots);
    await db.delete(tags);

    console.log('Creating fixtures directory...');
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    await fs.mkdir(FIXTURES_DIR, { recursive: true });

    const rootKey = 'fixtures-root';
    await db.insert(directoryRoots).values({
        rootKey,
        name: 'Fixtures Library',
        directories: [FIXTURES_DIR],
    });

    console.log('Generating 1000 video entries...');
    const videoEntries = [];

    for (let i = 1; i <= 1000; i++) {
        const id = randomUUID();
        const filename = `Video_${String(i).padStart(4, '0')}.mp4`;
        const filePath = path.join(FIXTURES_DIR, filename);

        // Create empty file
        await fs.writeFile(filePath, '');

        // Create unique thumbnail for this video
        const thumbsDir = path.join(FIXTURES_DIR, 'Thumbnails');
        await fs.mkdir(thumbsDir, { recursive: true });
        const thumbPath = path.join(thumbsDir, `${filename.replace('.mp4', '')}-thumb.jpg`);
        const uniqueThumbnail = generateUniqueThumbnail(i);
        await fs.writeFile(thumbPath, uniqueThumbnail);

        // Create unique sprite sheet for this video
        const spritePath = path.join(thumbsDir, `${filename.replace('.mp4', '')}-sprite.jpg`);
        const uniqueSprite = generateUniqueSprite(i);
        await fs.writeFile(spritePath, uniqueSprite);

        const duration = Math.floor(Math.random() * 3600) + 60; // 1 min to 1 hour
        const size = Math.floor(Math.random() * 1024 * 1024 * 1024) + 1024 * 1024; // 1MB to 1GB

        const categories: any = {};
        for (const [key, values] of Object.entries(SAMPLE_CATEGORIES)) {
            categories[key] = getRandomSubset(values);
        }

        videoEntries.push({
            id,
            filename,
            displayName: filename,
            path: filePath,
            size,
            lastModified: new Date(),
            metadata: {
                duration,
                width: 1920,
                height: 1080,
                bitrate: 5000,
                codec: 'h264',
                fps: 30,
                aspectRatio: '16:9'
            },
            categories,
            customCategories: {},
            rootKey,
            hashFast: randomUUID(), // fake hash
            hashPerceptual: randomUUID(), // fake hash
        });

        if (i % 100 === 0) console.log(`Generated ${i} entries...`);
    }

    console.log('Inserting into database...');
    // Insert in chunks to avoid query size limits
    const chunkSize = 100;
    for (let i = 0; i < videoEntries.length; i += chunkSize) {
        await db.insert(videos).values(videoEntries.slice(i, i + chunkSize));
    }

    console.log('Seeding complete!');
    await client.end();
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
