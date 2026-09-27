import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DoctorPreparationPage } from './pages/DoctorPreparationPage';
import { PatientJoinEntryPage } from './pages/PatientJoinEntryPage';
import { PatientPreparationPage } from './pages/PatientPreparationPage';
import { DoctorConsultationPage } from './pages/DoctorConsultationPage';
import { PatientConsultationPage } from './pages/PatientConsultationPage';
import {
  ConsultationRecordPage,
  NotFoundPage,
} from './pages/PlaceholderPage';

// Lazy-load development-only preview pages so they are never eagerly imported in production
const FoundationPreviewPage = import.meta.env.DEV
  ? React.lazy(() =>
      import('./pages/FoundationPreviewPage').then((m) => ({
        default: m.FoundationPreviewPage,
      }))
    )
  : null;

const SetupDevPreviewPage = import.meta.env.DEV
  ? React.lazy(() =>
      import('./pages/SetupDevPreviewPage').then((m) => ({
        default: m.SetupDevPreviewPage,
      }))
    )
  : null;

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      {/* Phase 3 Preparation & Join Routes */}
      <Route path="/consultation/new" element={<DoctorPreparationPage />} />
      <Route path="/join" element={<PatientJoinEntryPage />} />
      <Route path="/join/:token" element={<PatientPreparationPage />} />

      {/* Development-only preview fixture routes (strictly excluded from production) */}
      {import.meta.env.DEV && FoundationPreviewPage && (
        <Route
          path="/dev/foundation"
          element={
            <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading preview...</div>}>
              <FoundationPreviewPage />
            </Suspense>
          }
        />
      )}

      {import.meta.env.DEV && SetupDevPreviewPage && (
        <Route
          path="/dev/setup"
          element={
            <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading preview...</div>}>
              <SetupDevPreviewPage />
            </Suspense>
          }
        />
      )}

      {/* Phase 4 Consultation Room Routes */}
      <Route path="/doctor/:sessionId" element={<DoctorConsultationPage />} />
      <Route path="/patient/:sessionId" element={<PatientConsultationPage />} />
      <Route path="/record/:sessionId" element={<ConsultationRecordPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
