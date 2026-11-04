import type {
  ProjectPriority,
  ProjectStatus,
} from "@prisma/client";

export type ProjectDashboardRow = {
  id: string;
  code: string;
  name: string;
  title: string;
  kelompokTani: string;
  address: string;
  jenisPekerjaan: string | null;
  pagu: string;
  landArea: string | null;
  progress: number;
  status: ProjectStatus;
  vendor: string | null;
  priority: ProjectPriority;
  clientName: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: string | null;
  fieldPicId: string | null;
  fieldPicName: string | null;
  proposedWorkPointWages: string;
  approvedWorkPointWages: string;
  progressReports: ProjectProgressReport[];
  workPoints: ProjectWorkPointRow[];
};

export type ProjectWorkPointRow = {
  id: string;
  title: string;
  location: string | null;
  proposedTotalWage: string;
  approvedTotalWage: string | null;
  wageApprovedAt: string | null;
  proposedByName: string;
  approvedByName: string | null;
  progress: number;
  progressReports: ProjectWorkPointProgressRow[];
};

export type ProjectWorkPointProgressRow = {
  id: string;
  reportDate: string;
  progress: number;
  workSummary: string | null;
  photoUrls: string[];
};

export type FieldTeamOption = {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl: string | null;
};

export type ProjectProgressReport = {
  id: string;
  reportDate: string;
  progress: number | null;
  workSummary: string | null;
  photoUrls: string[];
};

export type ProjectProgressPoint = {
  date: string;
  progress: number;
};

export type ProjectDashboardSummary = {
  totalProjects: number;
  activeProjects: number;
  delayedProjects: number;
  totalBudget: string;
};
