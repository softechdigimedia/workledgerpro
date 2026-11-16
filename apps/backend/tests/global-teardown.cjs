module.exports = async () => {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    await prisma.$disconnect();
  } catch {
    // A skipped suite may never have initialized Prisma.
  }
};
