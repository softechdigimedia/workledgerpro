import {
  PrismaClient,
  UserRole,
  UserStatus,
  EmploymentStatus,
  FinanceAccountType,
  FinanceRequestType,
  FinanceRequestStatus,
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || "admin@enterprise.com").toLowerCase().trim();
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || "password123";
  const adminName = process.env.SUPER_ADMIN_NAME || "Alexander Wright";

  console.log(`[Seed] Initializing Enterprise Production Baseline in PostgreSQL...`);

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // 1. Super Admin
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // 2. Sub-Admin North
  const subAdminNorth = await prisma.user.upsert({
    where: { email: "subadmin.north@enterprise.com" },
    update: {
      name: "Sarah Jenkins",
      passwordHash,
      role: UserRole.SUB_ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      name: "Sarah Jenkins",
      email: "subadmin.north@enterprise.com",
      passwordHash,
      role: UserRole.SUB_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // 3. Sub-Admin West
  const subAdminWest = await prisma.user.upsert({
    where: { email: "subadmin.west@enterprise.com" },
    update: {
      name: "Elena Rostova",
      passwordHash,
      role: UserRole.SUB_ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      name: "Elena Rostova",
      email: "subadmin.west@enterprise.com",
      passwordHash,
      role: UserRole.SUB_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // 4. Standard Operational Shift
  const morningShift = await prisma.shift.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      name: "Morning Operations Shift",
      startTime: "09:00",
      endTime: "18:00",
      gracePeriod: 15,
      isActive: true,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Morning Operations Shift",
      startTime: "09:00",
      endTime: "18:00",
      gracePeriod: 15,
      isActive: true,
    },
  });

  // 5. Seed Field Employees
  const employeeUsers = [
    {
      name: "Rahul Sharma",
      email: "emp.rahul@enterprise.com",
      code: "EMP-101",
      subAdminId: subAdminNorth.id,
      department: "Field Logistics & Ground Ops",
      designation: "Senior Field Agent",
      initialBalance: 45000,
    },
    {
      name: "Priya Patel",
      email: "emp.priya@enterprise.com",
      code: "EMP-102",
      subAdminId: subAdminNorth.id,
      department: "Disbursement & Quality Ops",
      designation: "Operations Lead",
      initialBalance: 32000,
    },
    {
      name: "Amit Verma",
      email: "emp.amit@enterprise.com",
      code: "EMP-103",
      subAdminId: subAdminWest.id,
      department: "Regional Hub Transit",
      designation: "Logistics Specialist",
      initialBalance: 25000,
    },
  ];

  for (const emp of employeeUsers) {
    const user = await prisma.user.upsert({
      where: { email: emp.email },
      update: {
        name: emp.name,
        passwordHash,
        role: UserRole.EMPLOYEE,
        status: UserStatus.ACTIVE,
      },
      create: {
        name: emp.name,
        email: emp.email,
        passwordHash,
        role: UserRole.EMPLOYEE,
        status: UserStatus.ACTIVE,
      },
    });

    const employeeProfile = await prisma.employee.upsert({
      where: { userId: user.id },
      update: {
        assignedSubAdminId: emp.subAdminId,
        department: emp.department,
        designation: emp.designation,
        employmentStatus: EmploymentStatus.ACTIVE,
      },
      create: {
        userId: user.id,
        employeeCode: emp.code,
        assignedSubAdminId: emp.subAdminId,
        department: emp.department,
        designation: emp.designation,
        employmentStatus: EmploymentStatus.ACTIVE,
      },
    });

    // Finance Account
    await prisma.financeAccount.upsert({
      where: { employeeId: employeeProfile.id },
      update: {
        name: `${emp.name} Float Wallet`,
        isActive: true,
      },
      create: {
        name: `${emp.name} Float Wallet`,
        code: `FLT-${emp.code}`,
        accountType: FinanceAccountType.ASSET,
        employeeId: employeeProfile.id,
        currency: "INR",
        isActive: true,
      },
    });

    // Baseline Float Allocation
    if (emp.initialBalance > 0) {
      const existingAllocation = await prisma.financeRequest.findFirst({
        where: {
          employeeId: employeeProfile.id,
          type: FinanceRequestType.ADVANCE,
          description: "Baseline Float Allocation",
        },
      });
      if (!existingAllocation) {
        await prisma.financeRequest.create({
          data: {
            employeeId: employeeProfile.id,
            type: FinanceRequestType.ADVANCE,
            status: FinanceRequestStatus.APPROVED,
            amount: emp.initialBalance,
            currency: "INR",
            description: "Baseline Float Allocation",
            reason: "Initial operational baseline float funding",
            reviewedById: admin.id,
            reviewedAt: new Date(),
          },
        });
      }
    }

    // Shift Assignment
    const existingAssignment = await prisma.employeeShiftAssignment.findFirst({
      where: { employeeId: employeeProfile.id, shiftId: morningShift.id },
    });
    if (!existingAssignment) {
      await prisma.employeeShiftAssignment.create({
        data: {
          employeeId: employeeProfile.id,
          shiftId: morningShift.id,
          effectiveFrom: new Date(),
        },
      });
    }
  }

  // 6. Bootstrap Audit Trail
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "SYSTEM_INITIALIZED",
      entityType: "SYSTEM",
      entityId: "prod_bootstrap",
      description: "Production database baseline bootstrapped successfully",
      metadata: {
        superAdmin: admin.email,
        seedVersion: "3.0.0",
        environment: "production",
      },
      ipAddress: "127.0.0.1",
    },
  });

  console.log(`[Seed] Production baseline ready!`);
  console.log(`-----------------------------------------------`);
  console.log(`  Super Admin:  ${admin.email} (Password: ${adminPassword})`);
  console.log(`  Sub-Admin 1:  ${subAdminNorth.email} (Password: ${adminPassword})`);
  console.log(`  Sub-Admin 2:  ${subAdminWest.email} (Password: ${adminPassword})`);
  console.log(`  Employees:    EMP-101, EMP-102, EMP-103 provisioned with wallets`);
  console.log(`-----------------------------------------------`);
}

main()
  .catch((e) => {
    console.error("[Seed Error]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
