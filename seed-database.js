require('dotenv').config();
const mongoose = require('mongoose');

const User             = require('./src/models/User');
const Thesis           = require('./src/models/Thesis');
const ThesisRequest    = require('./src/models/ThesisRequest');
const Notification     = require('./src/models/Notification');
const AccountRequest   = require('./src/models/AccountRequest');
const AccountRetrieval = require('./src/models/AccountRetrieval');

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('🌱 Connected to MongoDB for seeding');
    seedDatabase();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// Placeholder Cloudinary URL — the file won't open, but all other features
// (browsing, detail view, file requests) work fine with seed data.
const PLACEHOLDER_PDF = 'https://res.cloudinary.com/demo/raw/upload/sample.pdf';

// ---------------------------------------------------------------------------
async function seedDatabase() {
  try {
    // ── 1. Clear all collections ─────────────────────────────────────────
    await Promise.all([
      User.deleteMany({}),
      Thesis.deleteMany({}),
      ThesisRequest.deleteMany({}),
      Notification.deleteMany({}),
      AccountRequest.deleteMany({}),
      AccountRetrieval.deleteMany({}),
    ]);
    console.log('🗑️  Cleared all collections');

    // ── 2. Users ─────────────────────────────────────────────────────────
    // Passwords are plaintext — the User pre-save hook hashes them automatically.
    const [admin, teacher1, teacher2, student1, student2, student3, student4, student5] =
      await Promise.all([
        User.create({ name: 'Michael Rojo',         email: 'michaelrojo@lnc.edu',   password: 'Admin@1234',   role: 'Admin',   createdAt: daysAgo(60) }),
        User.create({ name: 'Maria Santos',         email: 'msantos@lnc.edu',       password: 'Teacher@1234', role: 'Teacher', createdAt: daysAgo(45) }),
        User.create({ name: 'Jose Reyes',           email: 'jreyes@lnc.edu',        password: 'Teacher@1234', role: 'Teacher', createdAt: daysAgo(40) }),
        User.create({ name: 'Franz Raschid Loyola', email: 'franzloyola@lnc.edu',   password: 'Student@1234', role: 'Student', createdAt: daysAgo(30) }),
        User.create({ name: 'Hanz Villegas',        email: 'hanzvillegas@lnc.edu',  password: 'Student@1234', role: 'Student', createdAt: daysAgo(25) }),
        User.create({ name: 'Charles Darwin Garcia',email: 'charlesgarcia@lnc.edu', password: 'Student@1234', role: 'Student', createdAt: daysAgo(20) }),
        User.create({ name: 'John Michael Aquino',  email: 'jmaquino@lnc.edu',      password: 'Student@1234', role: 'Student', createdAt: daysAgo(15) }),
        User.create({ name: 'Aira Joy Francisco',   email: 'ajfrancisco@lnc.edu',   password: 'Student@1234', role: 'Student', createdAt: daysAgo(10) }),
      ]);
    console.log('👥  Created 8 users (1 Admin, 2 Teachers, 5 Students)');

    // ── 3. Theses ─────────────────────────────────────────────────────────
    const theses = await Thesis.insertMany([
      {
        title: 'Machine Learning Applications in Healthcare Diagnostics',
        abstract: 'This capstone project explores practical applications of machine learning algorithms in healthcare, with a focus on diagnostic imaging, early disease detection, and patient outcome prediction. Using a dataset of 10,000 anonymized medical records, we trained and evaluated five supervised learning models. Results demonstrate a 23% improvement in early cancer detection accuracy over baseline clinical methods, highlighting the transformative potential of AI in Philippine healthcare settings.',
        category: 'Capstone',
        course: 'BSIT',
        adviser: 'Maria Santos',
        authorsName: 'Franz Raschid Loyola, Charles Darwin Garcia',
        yearPublished: '2026',
        fileUrl: PLACEHOLDER_PDF,
        author: student1._id,
        status: 'Approved',
        createdAt: daysAgo(28),
      },
      {
        title: 'Blockchain-Based Transparent Voting System for Barangay Elections',
        abstract: 'This research proposes and prototypes a blockchain-based electronic voting system tailored for barangay-level elections in the Philippines. The system leverages a permissioned Ethereum blockchain to ensure vote immutability, anonymity, and auditability. A comparative security analysis against the current paper-ballot system is presented, demonstrating significant reductions in fraud risk and manual counting errors while maintaining accessibility for low-literacy voters.',
        category: 'Research',
        course: 'BSCS',
        adviser: 'Jose Reyes',
        authorsName: 'Hanz Villegas, John Michael Aquino, Aira Joy Francisco',
        yearPublished: '2026',
        fileUrl: PLACEHOLDER_PDF,
        author: student2._id,
        status: 'Approved',
        createdAt: daysAgo(20),
      },
      {
        title: 'Smart Irrigation System Using IoT Sensors for Small-Scale Farmers',
        abstract: 'This capstone presents a low-cost Internet of Things (IoT) irrigation automation system designed for small-scale rice farmers in rural Luzon. Soil moisture, temperature, and humidity sensors feed real-time data to a Raspberry Pi controller that actuates water pumps based on crop-specific thresholds. Field trials over one planting season showed a 31% reduction in water usage and a 14% increase in crop yield compared to traditional manual irrigation practices.',
        category: 'Capstone',
        course: 'BSIT',
        adviser: 'Maria Santos',
        authorsName: 'Hanz Villegas',
        yearPublished: '2026',
        fileUrl: PLACEHOLDER_PDF,
        author: student2._id,
        status: 'Approved',
        createdAt: daysAgo(15),
      },
      {
        title: 'Automated Student Attendance Tracking Using Facial Recognition',
        abstract: 'This thesis investigates the feasibility and accuracy of a facial recognition-based attendance system for higher education institutions. A convolutional neural network trained on a custom dataset of 200 student faces achieved 96.4% recognition accuracy under standard classroom lighting conditions. The system integrates with an existing Student Information System via a RESTful API and reduces average attendance recording time from 5 minutes to under 30 seconds per class session.',
        category: 'Thesis',
        course: 'BSCS',
        adviser: 'Jose Reyes',
        authorsName: 'Franz Raschid Loyola',
        yearPublished: '2026',
        fileUrl: PLACEHOLDER_PDF,
        author: student1._id,
        status: 'Pending',
        createdAt: daysAgo(5),
      },
      {
        title: 'Mobile-Based Disaster Early Warning System for Coastal Communities',
        abstract: 'This research develops a cross-platform mobile application that delivers hyperlocal disaster early warnings to coastal communities in typhoon-prone provinces. The app aggregates data from PAGASA APIs, NDRRMC bulletins, and a network of volunteer weather stations to issue push notifications up to 6 hours before landfall. A pilot deployment in Leyte covered 1,200 households and achieved an 89% notification delivery rate even under degraded mobile network conditions.',
        category: 'Research',
        course: 'BSIT',
        adviser: 'Maria Santos',
        authorsName: 'Charles Darwin Garcia, John Michael Aquino',
        yearPublished: '2026',
        fileUrl: PLACEHOLDER_PDF,
        author: student3._id,
        status: 'Pending',
        createdAt: daysAgo(2),
      },
      {
        title: 'E-Commerce Platform with AI-Driven Product Recommendation Engine',
        abstract: 'This capstone developed a full-stack e-commerce platform with an integrated collaborative filtering recommendation engine. The recommendation system was trained on a synthetic dataset of 50,000 purchase transactions and achieved a precision@10 of 0.74 on held-out test data. The platform was load-tested to support 500 concurrent users without degradation, and the checkout conversion rate improved by 18% compared to a static product listing baseline.',
        category: 'Capstone',
        course: 'BSBA',
        adviser: 'Jose Reyes',
        authorsName: 'Hanz Villegas, Aira Joy Francisco',
        yearPublished: '2025',
        fileUrl: PLACEHOLDER_PDF,
        author: student2._id,
        status: 'Rejected',
        rejectionReason: 'Insufficient primary research and over-reliance on synthetic datasets. Please conduct user testing with real customers and resubmit with updated methodology.',
        createdAt: daysAgo(10),
      },
    ]);
    console.log('📚  Created 6 theses (3 Approved, 2 Pending, 1 Rejected)');

    const [thesis1, thesis2, thesis3] = theses; // first three are Approved

    // ── 4. Thesis File Requests ───────────────────────────────────────────
    // Demonstrates the three main request states visible in the admin panel.
    await ThesisRequest.insertMany([
      {
        thesis: thesis1._id,
        requester: student3._id,
        reason: 'I am conducting a related study on AI applications in Philippine healthcare and need this thesis as a primary reference for my methodology chapter.',
        status: 'pending',
        authorToken: ThesisRequest.generateToken(),
        adminToken: ThesisRequest.generateToken(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(3),
      },
      {
        thesis: thesis2._id,
        requester: student4._id,
        reason: 'This thesis is directly relevant to my capstone on digital governance systems. I need the full document to properly cite and build upon the blockchain architecture described.',
        status: 'approved',
        approvedByType: 'Administrator',
        approvedBy: admin._id,
        approvedAt: daysAgo(1),
        createdAt: daysAgo(4),
      },
      {
        thesis: thesis3._id,
        requester: student5._id,
        reason: 'I am writing a research paper on sustainable agriculture technology and this IoT irrigation study is directly aligned with my topic area.',
        status: 'fulfilled',
        approvedByType: 'Author',
        approvedBy: teacher1._id,
        approvedAt: daysAgo(6),
        fulfilledAt: daysAgo(6),
        createdAt: daysAgo(8),
      },
    ]);
    console.log('�  Created 3 file requests (1 pending, 1 approved, 1 fulfilled)');

    // ── 5. Summary ────────────────────────────────────────────────────────
    console.log('\n✅  Database seeded successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑  Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ADMIN   │ michaelrojo@lnc.edu      │ Admin@1234');
    console.log('  TEACHER │ msantos@lnc.edu          │ Teacher@1234');
    console.log('  TEACHER │ jreyes@lnc.edu           │ Teacher@1234');
    console.log('  STUDENT │ franzloyola@lnc.edu      │ Student@1234');
    console.log('  STUDENT │ hanzvillegas@lnc.edu     │ Student@1234');
    console.log('  STUDENT │ charlesgarcia@lnc.edu    │ Student@1234');
    console.log('  STUDENT │ jmaquino@lnc.edu         │ Student@1234');
    console.log('  STUDENT │ ajfrancisco@lnc.edu      │ Student@1234');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  NOTE: Thesis file links use a Cloudinary placeholder URL.');
    console.log('    The file itself will not open, but browsing, detail view,');
    console.log('    and the file request workflow all function normally.\n');

  } catch (error) {
    console.error('❌ Seeding error:', error.message);
    if (error.code === 11000) {
      console.error('   Duplicate key — wipe the DB first or re-run with a fresh MONGO_URI.');
    }
  } finally {
    await mongoose.connection.close();
    console.log('🔌  MongoDB connection closed');
  }
}
