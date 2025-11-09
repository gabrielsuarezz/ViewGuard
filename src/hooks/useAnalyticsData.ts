import { useNotifications } from '@/contexts/NotificationsContext';
import { useReports } from '@/contexts/ReportsContext';
import { useMemo } from 'react';

export interface AnalyticsData {
  totalDetections: number;
  activeNotifications: number;
  reportedIncidents: number;
  highRiskCount: number;
  detectionsByType: Record<string, number>;
  detectionsByCamera: Record<number, number>;
  topCamera: {
    id: number;
    count: number;
  };
  recentDetections: Array<{
    type: string;
    cameraId: number;
    timestamp: Date;
    confidence: number;
    isReport: boolean;
  }>;
}

export const useAnalyticsData = (): AnalyticsData => {
  const { notifications, getHighRiskCount } = useNotifications();
  const { reports } = useReports();

  return useMemo(() => {
    // Combine all incidents
    const allIncidents = [
      ...notifications.map(n => ({ ...n, isReport: false })),
      ...reports.map(r => ({ ...r, isReport: true }))
    ];

    // Calculate detections by type
    const detectionsByType: Record<string, number> = {};
    allIncidents.forEach(incident => {
      const type = incident.detection.type;
      detectionsByType[type] = (detectionsByType[type] || 0) + 1;
    });

    // Calculate detections by camera
    const detectionsByCamera: Record<number, number> = {};
    allIncidents.forEach(incident => {
      detectionsByCamera[incident.cameraId] = (detectionsByCamera[incident.cameraId] || 0) + 1;
    });

    // Find top camera
    let topCamera = { id: 1, count: 0 };
    Object.entries(detectionsByCamera).forEach(([cameraId, count]) => {
      if (count > topCamera.count) {
        topCamera = { id: Number(cameraId), count };
      }
    });

    // Get recent detections (last 10)
    const recentDetections = allIncidents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10)
      .map(incident => ({
        type: incident.detection.type,
        cameraId: incident.cameraId,
        timestamp: incident.timestamp,
        confidence: incident.detection.confidence,
        isReport: incident.isReport
      }));

    return {
      totalDetections: allIncidents.length,
      activeNotifications: notifications.length,
      reportedIncidents: reports.length,
      highRiskCount: getHighRiskCount(),
      detectionsByType,
      detectionsByCamera,
      topCamera,
      recentDetections
    };
  }, [notifications, reports, getHighRiskCount]);
};
