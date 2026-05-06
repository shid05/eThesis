require('dotenv').config();
const mongoose = require('mongoose');

const User          = require('./src/models/User');
const Thesis        = require('./src/models/Thesis');
const Review        = require('./src/models/Review');
const StudentRating = require('./src/models/StudentRating');
const Notification  = require('./src/models/Notification');
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

// Placeholder Cloudinary URL — download will return 404 from Cloudinary,
// but all other thesis features (detail, review, rate) work fine with seed data.
const PLACEHOLDER_PDF = 'https://res.cloudinary.com/demo/raw/upload/sample.pdf';

// ---------------------------------------------------------------------------
async function seedDatabase() {
  try {
    // ── 1. Clear all collections ─────────────────────────────────────────
    await Promise.all([
      User.deleteMany({}),
      Thesis.deleteMany({}),
      Review.deleteMany({}),
      StudentRating.deleteMany({}),
      Notification.deleteMany({}),
      AccountRequest.deleteMany({}),
      AccountRetrieval.deleteMany({}),
    ]);
    console.log('🗑️  Cleared all collections');

    // ── 2. Users ─────────────────────────────────────────────────────────
    // Passwords are plaintext here — the User pre-save hook hashes them.
    const [admin, teacher1, teacher2, student1, student2, student3] = await Promise.all([
      User.create({ name: 'Michael Rojo',      email: 'michaelrojo@lnc.edu',    password: 'Admin@1234',   role: 'Admin',   createdAt: daysAgo(60) }),
      User.create({ name: 'Maria Santos',    email: 'msantos@lnc.edu',  password: 'Teacher@1234', role: 'Teacher', createdAt: daysAgo(45) }),
      User.create({ name: 'Jose Reyes',      email: 'jreyes@lnc.edu',   password: 'Teacher@1234', role: 'Teacher', createdAt: daysAgo(40) }),
      User.create({ name: 'Franz Raschid Loyola',        email: 'franzloyola@lnc.edu',    password: 'Student@1234', role: 'Student', createdAt: daysAgo(30) }),
      User.create({ name: 'Hanz Villegas',   email: 'hanzvillegas@lnc.edu', password: 'Student@1234', role: 'Student', createdAt: daysAgo(25) }),
      User.create({ name: 'Charles Darwin Garcia',   email: 'charlesgarcia@lnc.edu',  password: 'Student@1234', role: 'Student', createdAt: daysAgo(20) }),
      User.create({ name: 'John Michael Aquino',   email: 'jmaquino@lnc.edu',  password: 'Student@1234', role: 'Student', createdAt: daysAgo(15) }),
      User.create({ name: 'Aira Joy Francisco',   email: 'ajfrancisco@lnc.edu',  password: 'Student@1234', role: 'Student', createdAt: daysAgo(10) }),
    ]);
    console.log('👥  Created 6 users (1 Admin, 2 Teachers, 3 Students)');

    // ── 3. Theses ─────────────────────────────────────────────────────────
    // adviser values match teacher names exactly so the approval gate works.
    const theses = await Thesis.insertMany([
      {
        title: 'Machine Learning Applications in Healthcare Diagnostics',
        abstract: 'This capstone project explores practical applications of machine learning algorithms in healthcare, with a focus on diagnostic imaging, early disease detection, and patient outcome prediction. Using a dataset of 10,000 anonymized medical records, we trained and evaluated five supervised learning models. Results demonstrate a 23% improvement in early cancer detection accuracy over baseline clinical methods, highlighting the transformative potential of AI in Philippine healthcare settings.',
        category: 'Capstone',
        course: 'BSIT',
        adviser: 'Maria Santos',
        authorsName: 'Franz Raschid Loyola, Charles Garcia',
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
        author: student3._id,
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
        abstract: 'This capstone developed a full-stack e-commerce platform with an integrated collaborative filtering recommendation engine. The recommendation system was trained on a synthetic dataset of 50,000 purchase transactions and achieved a precision@10 of 0.74 on held-out test data. The platform was load-tested to support 500 concurrent users without degradation.',
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

    const [thesis1, thesis2, thesis3] = theses; // only approved theses get reviews/ratings

    // ── 4. Teacher Reviews (approved theses only) ─────────────────────────
    await Review.insertMany([
      {
        thesisId: thesis1._id,
        reviewerId: teacher1._id,
        rating: 5,
        comment: 'Outstanding methodology and clearly articulated results. The 23% improvement benchmark is well-supported by the dataset analysis. Recommend for publication in the departmental research journal.',
        createdAt: daysAgo(25),
      },
      {
        thesisId: thesis1._id,
        reviewerId: teacher2._id,
        rating: 4,
        comment: 'Solid contribution to the field. The literature review is comprehensive. I recommend expanding the discussion on ethical implications of AI in clinical settings before final publication.',
        createdAt: daysAgo(24),
      },
      {
        thesisId: thesis2._id,
        reviewerId: teacher2._id,
        rating: 5,
        comment: 'Impressive technical depth for an undergraduate capstone. The security analysis is rigorous and the low-literacy accessibility consideration shows real-world awareness. Excellent work.',
        createdAt: daysAgo(17),
      },
      {
        thesisId: thesis3._id,
        reviewerId: teacher1._id,
        rating: 4,
        comment: 'The IoT system design is practical and the field trial results are compelling. The cost breakdown section could be more detailed to help future implementors replicate the system.',
        createdAt: daysAgo(12),
      },
    ]);
    console.log('⭐  Created 4 teacher reviews');

    // ── 5. Student Ratings (approved theses only, no self-rating) ─────────
    await StudentRating.insertMany([
      {
        thesisId: thesis1._id,
        studentId: student3._id,
        rating: 5,
        comment: 'Very relevant to our current healthcare challenges in the Philippines. The findings are clearly explained and the methodology section was easy to follow even for a non-ML student.',
        createdAt: daysAgo(22),
      },
      {
        thesisId: thesis2._id,
        studentId: student1._id,
        rating: 5,
        comment: 'This is exactly the kind of civic tech research we need. The blockchain voting prototype is genuinely impressive and the security comparison with paper ballots was eye-opening.',
        createdAt: daysAgo(16),
      },
      {
        thesisId: thesis2._id,
        studentId: student2._id,
        rating: 4,
        comment: 'Great concept and well-written. I wish there was more discussion on how this could scale to city-level elections.',
        createdAt: daysAgo(15),
      },
      {
        thesisId: thesis3._id,
        studentId: student1._id,
        rating: 4,
        comment: 'As someone from a farming province, this hits close to home. The water savings stat is remarkable. Hope this gets piloted more broadly.',
        createdAt: daysAgo(10),
      },
      {
        thesisId: thesis3._id,
        studentId: student3._id,
        rating: 5,
        comment: 'Practical, well-researched, and socially relevant. The Raspberry Pi implementation shows strong engineering skills. Would love to see this commercialized.',
        createdAt: daysAgo(9),
      },
    ]);
    console.log('👍  Created 5 student ratings');

    // ── 6. Summary ────────────────────────────────────────────────────────
    console.log('\n✅  Database seeded successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑  Login Credentials (password shown is pre-hash):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ADMIN   │ michaelrojo@lnc.edu       │ Admin@1234');
    console.log('  TEACHER │ msantos@lnc.edu     │ Teacher@1234');
    console.log('  TEACHER │ jreyes@lnc.edu      │ Teacher@1234');
    console.log('  STUDENT │ franzloyola@lnc.edu       │ Student@1234');
    console.log('  STUDENT │ hanzvillegas@lnc.edu    │ Student@1234');
    console.log('  STUDENT │ charlesgarcia@lnc.edu     │ Student@1234');
    console.log('  STUDENT │ jmaquino@lnc.edu     │ Student@1234');
    console.log('  STUDENT │ ajfrancisco@lnc.edu     │ Student@1234');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  NOTE: Thesis PDF downloads will return a Cloudinary');
    console.log('    404 — placeholder URLs are used for seed data.');
    console.log('    All other features (detail, review, rate) work normally.\n');

  } catch (error) {
    console.error('❌ Seeding error:', error.message);
    if (error.code === 11000) {
      console.error('   Duplicate key — run the script again after clearing the DB.');
    }
  } finally {
    await mongoose.connection.close();
    console.log('🔌  MongoDB connection closed');
  }
}
