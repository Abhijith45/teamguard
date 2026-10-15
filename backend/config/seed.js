import "dotenv/config";
import { prisma } from "./prisma.js";
import { hashPassword } from "../src/utils/password.js";

const permissionsData = [
  // Dashboard
  { resource: "dashboard", action: "view", description: "View workspace dashboard" },
  { resource: "dashboard", action: "export", description: "Export dashboard statistics" },
  // Projects
  { resource: "project", action: "view", description: "View projects" },
  { resource: "project", action: "create", description: "Create projects" },
  { resource: "project", action: "update", description: "Update projects" },
  { resource: "project", action: "delete", description: "Delete projects" },
  // Tasks
  { resource: "task", action: "view", description: "View tasks" },
  { resource: "task", action: "create", description: "Create tasks" },
  { resource: "task", action: "update:own", description: "Update own assigned tasks" },
  { resource: "task", action: "update:any", description: "Update any task" },
  { resource: "task", action: "assign", description: "Assign tasks to members" },
  { resource: "task", action: "delete", description: "Delete tasks" },
  { resource: "task", action: "export", description: "Export tasks data" },
  // Files
  { resource: "files", action: "view", description: "View and browse files" },
  { resource: "files", action: "upload", description: "Upload new files" },
  { resource: "files", action: "update", description: "Edit/duplicate files" },
  { resource: "files", action: "delete", description: "Delete files" },
  { resource: "files", action: "download", description: "Download files" },
  // Administration & Auth
  { resource: "members", action: "manage", description: "Manage organization members" },
  { resource: "roles", action: "manage", description: "Manage roles and permissions" },
  { resource: "audit", action: "read", description: "Read security audit logs" },
  { resource: "profile", action: "read", description: "Read user profile" },
];

async function main() {
  console.log("Seeding TeamGuard multi-tenant database...");

  // 1. Upsert Permissions
  const permissionsMap = new Map();
  for (const item of permissionsData) {
    const perm = await prisma.permission.upsert({
      where: { resource_action: { resource: item.resource, action: item.action } },
      update: { description: item.description },
      create: item,
    });
    permissionsMap.set(`${item.resource}:${item.action}`, perm);
  }

  // 2. Upsert Organizations
  const acme = await prisma.organization.upsert({
    where: { slug: "acme-corp" },
    update: { name: "Acme Corp" },
    create: { name: "Acme Corp", slug: "acme-corp" },
  });

  const nova = await prisma.organization.upsert({
    where: { slug: "nova-labs" },
    update: { name: "Nova Labs" },
    create: { name: "Nova Labs", slug: "nova-labs" },
  });

  // 3. Define Roles function
  async function setupOrgRoles(orgId) {
    const superAdminRole = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: orgId, name: "Super Admin" } },
      update: {},
      create: {
        organizationId: orgId,
        name: "Super Admin",
        slug: "super-admin",
        description: "Full administrative access to organization",
        isSystem: true,
      },
    });

    const managerRole = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: orgId, name: "Project Manager" } },
      update: {},
      create: {
        organizationId: orgId,
        name: "Project Manager",
        slug: "project-manager",
        description: "Can manage projects, tasks, and files",
        isSystem: true,
      },
    });

    const memberRole = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: orgId, name: "Team Member" } },
      update: {},
      create: {
        organizationId: orgId,
        name: "Team Member",
        slug: "team-member",
        description: "Can create and update assigned tasks",
        isSystem: true,
      },
    });

    const stakeholderRole = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: orgId, name: "Stakeholder" } },
      update: {},
      create: {
        organizationId: orgId,
        name: "Stakeholder",
        slug: "stakeholder",
        description: "Read-only viewer of dashboard, projects, and tasks",
        isSystem: true,
      },
    });

    // Assign permissions to Super Admin (all)
    for (const perm of permissionsMap.values()) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: superAdminRole.id, permissionId: perm.id },
      });
    }

    // Assign permissions to Project Manager
    const managerKeys = [
      "dashboard:view", "dashboard:export",
      "project:view", "project:create", "project:update",
      "task:view", "task:create", "task:update:any", "task:assign", "task:export",
      "files:view", "files:upload", "files:update", "files:download",
      "profile:read"
    ];
    for (const key of managerKeys) {
      const perm = permissionsMap.get(key);
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: managerRole.id, permissionId: perm.id } },
          update: {},
          create: { roleId: managerRole.id, permissionId: perm.id },
        });
      }
    }

    // Assign permissions to Team Member
    const memberKeys = [
      "dashboard:view",
      "project:view",
      "task:view", "task:create", "task:update:own",
      "files:view", "files:download",
      "profile:read"
    ];
    for (const key of memberKeys) {
      const perm = permissionsMap.get(key);
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: memberRole.id, permissionId: perm.id } },
          update: {},
          create: { roleId: memberRole.id, permissionId: perm.id },
        });
      }
    }

    // Assign permissions to Stakeholder
    const stakeholderKeys = [
      "dashboard:view",
      "project:view",
      "task:view",
      "files:view",
      "profile:read"
    ];
    for (const key of stakeholderKeys) {
      const perm = permissionsMap.get(key);
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: stakeholderRole.id, permissionId: perm.id } },
          update: {},
          create: { roleId: stakeholderRole.id, permissionId: perm.id },
        });
      }
    }

    return { superAdminRole, managerRole, memberRole, stakeholderRole };
  }

  const acmeRoles = await setupOrgRoles(acme.id);
  const novaRoles = await setupOrgRoles(nova.id);

  // 4. Create Demo Users
  const defaultPasswordHash = await hashPassword("Password123!");

  const annisa = await prisma.user.upsert({
    where: { email: "admin@teamguard.io" },
    update: { name: "Annisa Azizah", username: "annisa" },
    create: {
      name: "Annisa Azizah",
      username: "annisa",
      email: "admin@teamguard.io",
      passwordHash: defaultPasswordHash,
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    },
  });

  const alex = await prisma.user.upsert({
    where: { email: "manager@teamguard.io" },
    update: { name: "Alex Chen", username: "alexchen" },
    create: {
      name: "Alex Chen",
      username: "alexchen",
      email: "manager@teamguard.io",
      passwordHash: defaultPasswordHash,
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80",
    },
  });

  const sarah = await prisma.user.upsert({
    where: { email: "member@teamguard.io" },
    update: { name: "Sarah Wijaya", username: "sarahw" },
    create: {
      name: "Sarah Wijaya",
      username: "sarahw",
      email: "member@teamguard.io",
      passwordHash: defaultPasswordHash,
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80",
    },
  });

  const rizky = await prisma.user.upsert({
    where: { email: "viewer@teamguard.io" },
    update: { name: "Rizky Pratama", username: "rizky" },
    create: {
      name: "Rizky Pratama",
      username: "rizky",
      email: "viewer@teamguard.io",
      passwordHash: defaultPasswordHash,
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80",
    },
  });

  // 5. Connect Memberships
  // In Acme Corp:
  // Annisa -> Super Admin
  const memAnnisaAcme = await prisma.membership.upsert({
    where: { userId_organizationId: { userId: annisa.id, organizationId: acme.id } },
    update: {},
    create: { userId: annisa.id, organizationId: acme.id, department: "Executive" },
  });
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: memAnnisaAcme.id, roleId: acmeRoles.superAdminRole.id } },
    update: {},
    create: { membershipId: memAnnisaAcme.id, roleId: acmeRoles.superAdminRole.id },
  });

  // Alex -> Project Manager
  const memAlexAcme = await prisma.membership.upsert({
    where: { userId_organizationId: { userId: alex.id, organizationId: acme.id } },
    update: {},
    create: { userId: alex.id, organizationId: acme.id, department: "Engineering" },
  });
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: memAlexAcme.id, roleId: acmeRoles.managerRole.id } },
    update: {},
    create: { membershipId: memAlexAcme.id, roleId: acmeRoles.managerRole.id },
  });

  // Sarah -> Team Member
  const memSarahAcme = await prisma.membership.upsert({
    where: { userId_organizationId: { userId: sarah.id, organizationId: acme.id } },
    update: {},
    create: { userId: sarah.id, organizationId: acme.id, department: "Design" },
  });
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: memSarahAcme.id, roleId: acmeRoles.memberRole.id } },
    update: {},
    create: { membershipId: memSarahAcme.id, roleId: acmeRoles.memberRole.id },
  });

  // Rizky -> Stakeholder
  const memRizkyAcme = await prisma.membership.upsert({
    where: { userId_organizationId: { userId: rizky.id, organizationId: acme.id } },
    update: {},
    create: { userId: rizky.id, organizationId: acme.id, department: "External" },
  });
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: memRizkyAcme.id, roleId: acmeRoles.stakeholderRole.id } },
    update: {},
    create: { membershipId: memRizkyAcme.id, roleId: acmeRoles.stakeholderRole.id },
  });

  // In Nova Labs:
  // Annisa -> Stakeholder (Viewer only) - demonstrates multi-tenant role distinction!
  const memAnnisaNova = await prisma.membership.upsert({
    where: { userId_organizationId: { userId: annisa.id, organizationId: nova.id } },
    update: {},
    create: { userId: annisa.id, organizationId: nova.id, department: "Advisory" },
  });
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: memAnnisaNova.id, roleId: novaRoles.stakeholderRole.id } },
    update: {},
    create: { membershipId: memAnnisaNova.id, roleId: novaRoles.stakeholderRole.id },
  });

  // 6. Projects in Acme Corp
  const projectsData = [
    { name: "Nova UI Revamp", description: "Complete visual redesign of core web platform", progress: 40, priority: "HIGH" },
    { name: "Orion SaaS Platform", description: "Enterprise multi-tenant backend infrastructure", progress: 80, priority: "MEDIUM" },
    { name: "PixelFrame Website", description: "Marketing site and brand guidelines implementation", progress: 65, priority: "MEDIUM" },
    { name: "Zetta Landing Page", description: "Conversion-optimized product teaser page", progress: 25, priority: "LOW" },
  ];

  const projects = [];
  for (const p of projectsData) {
    const existing = await prisma.project.findFirst({
      where: { organizationId: acme.id, name: p.name },
    });
    if (existing) {
      projects.push(existing);
    } else {
      const created = await prisma.project.create({
        data: { ...p, organizationId: acme.id },
      });
      projects.push(created);
    }
  }

  // 7. Seed Kanban Tasks in Acme Corp
  const tasksData = [
    // To do
    {
      title: "Design Landing Page Hero",
      description: "Create a clean and engaging hero section with responsive variants.",
      status: "TODO",
      priority: "HIGH",
      assigneeId: sarah.id,
      creatorId: alex.id,
      commentsCount: 12,
      attachmentsCount: 8,
      projectId: projects[0].id,
    },
    {
      title: "Write Blog Article Draft",
      description: "Initial draft for 'Top 10 UI Trends in 2026 and Beyond'.",
      status: "TODO",
      priority: "LOW",
      assigneeId: sarah.id,
      creatorId: alex.id,
      commentsCount: 4,
      attachmentsCount: 1,
      projectId: projects[1].id,
    },
    // In Progress
    {
      title: "Dashboard Redesign",
      description: "Updating Nova UI Revamp dashboard flow and stats widgets.",
      status: "IN_PROGRESS",
      priority: "LOW",
      assigneeId: sarah.id,
      creatorId: alex.id,
      commentsCount: 24,
      attachmentsCount: 3,
      projectId: projects[0].id,
    },
    {
      title: "Icon Library Update",
      description: "Add new 24px outlined icons for consistent visual system.",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      assigneeId: sarah.id,
      creatorId: annisa.id,
      commentsCount: 5,
      attachmentsCount: 2,
      projectId: projects[2].id,
    },
    {
      title: "Responsive Fixes",
      description: "Adjust Orion SaaS platform layout for mobile and tablet viewport.",
      status: "IN_PROGRESS",
      priority: "LOW",
      assigneeId: alex.id,
      creatorId: annisa.id,
      commentsCount: 4,
      attachmentsCount: 4,
      projectId: projects[1].id,
    },
    // Revision
    {
      title: "Mobile Navigation Flow",
      description: "Revise bottom navigation design based on user interview feedback.",
      status: "REVISION",
      priority: "HIGH",
      assigneeId: sarah.id,
      creatorId: alex.id,
      commentsCount: 3,
      attachmentsCount: 2,
      projectId: projects[0].id,
    },
    {
      title: "Typography Guidelines",
      description: "Update PixelFrame Website heading font scales and weights.",
      status: "REVISION",
      priority: "MEDIUM",
      assigneeId: alex.id,
      creatorId: annisa.id,
      commentsCount: 32,
      attachmentsCount: 4,
      projectId: projects[2].id,
    },
    {
      title: "Color Palette Adjustment",
      description: "Fine-tune neutral gray shades for dark mode contrast.",
      status: "REVISION",
      priority: "MEDIUM",
      assigneeId: sarah.id,
      creatorId: alex.id,
      commentsCount: 12,
      attachmentsCount: 18,
      projectId: projects[3].id,
    },
    // Done
    {
      title: "Project Presentation Slides",
      description: "Completed pitch deck for new client product showcase.",
      status: "DONE",
      priority: "MEDIUM",
      assigneeId: alex.id,
      creatorId: annisa.id,
      commentsCount: 9,
      attachmentsCount: 15,
      projectId: projects[1].id,
    },
    {
      title: "Team Onboarding Flow",
      description: "Finished onboarding walkthrough design and guide documentation.",
      status: "DONE",
      priority: "HIGH",
      assigneeId: annisa.id,
      creatorId: annisa.id,
      commentsCount: 5,
      attachmentsCount: 7,
      projectId: projects[0].id,
    },
  ];

  for (const t of tasksData) {
    const existing = await prisma.task.findFirst({
      where: { organizationId: acme.id, title: t.title },
    });
    if (!existing) {
      await prisma.task.create({
        data: { ...t, organizationId: acme.id },
      });
    }
  }

  // 8. Files in Acme Corp
  const filesData = [
    { name: "Dashboard_UI.fig", sizeBytes: 2100000, fileType: "Figma File", uploadedById: sarah.id, projectId: projects[0].id },
    { name: "API_Guide.pdf", sizeBytes: 680000, fileType: "PDF", uploadedById: rizky.id, projectId: projects[1].id },
    { name: "logo-v2.svg", sizeBytes: 340000, fileType: "SVG", uploadedById: annisa.id, projectId: projects[2].id },
    { name: "ReleaseNotes.docx", sizeBytes: 980000, fileType: "Word", uploadedById: alex.id, projectId: projects[0].id },
    { name: "landing_mockup.png", sizeBytes: 1800000, fileType: "Image", uploadedById: sarah.id, projectId: projects[3].id },
    { name: "database_schema.sql", sizeBytes: 75000, fileType: "SQL File", uploadedById: alex.id, projectId: projects[1].id },
    { name: "meeting_record.mp4", sizeBytes: 25000000, fileType: "Video", uploadedById: annisa.id, projectId: projects[0].id },
    { name: "readme.md", sizeBytes: 15000, fileType: "Markdown", uploadedById: alex.id, projectId: projects[2].id },
    { name: "Zetta_Assets.zip", sizeBytes: 12500000, fileType: "ZIP File", uploadedById: sarah.id, projectId: projects[3].id },
    { name: "QA_Report.xlsx", sizeBytes: 520000, fileType: "Excel", uploadedById: sarah.id, projectId: projects[0].id },
  ];

  for (const f of filesData) {
    const existing = await prisma.fileAsset.findFirst({
      where: { organizationId: acme.id, name: f.name },
    });
    if (!existing) {
      await prisma.fileAsset.create({
        data: { ...f, organizationId: acme.id },
      });
    }
  }

  // 9. Initial Audit Log
  await prisma.auditLog.create({
    data: {
      organizationId: acme.id,
      actorId: annisa.id,
      action: "organization:bootstrap",
      resourceType: "Organization",
      resourceId: String(acme.id),
      details: "Organization Acme Corp initialized with default RBAC hierarchy and demo projects.",
      outcome: "SUCCESS",
    },
  });

  console.log("TeamGuard seed completed successfully!");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });