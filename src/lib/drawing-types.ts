export type DrawingLogItem = {
  id: string;
  action: string;
  notes: string | null;
  version: number;
  fileUrl: string | null;
  createdAt: string;
  createdBy: {
    name: string;
    role: string;
  };
};

export type DrawingWorkspaceItem = {
  id: string;
  drawingCode: string;
  projectId: string | null;
  projectName: string | null;
  title: string;
  category: string;
  version: number;
  status: string;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  uploadedBy: {
    name: string;
  };
  createdAt: string;
  updatedAt: string;
  logs: DrawingLogItem[];
};

export type DrawingProjectOption = {
  id: string;
  name: string;
  code: string;
};

export type DrawingProjectSurveySummary = {
  projectId: string;
  locationName: string;
  areaSqm: number | null;
  surveyorName: string;
  createdAt: string;
};
