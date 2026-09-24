import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import {
  DoctorSetupPage,
  PatientJoinPage,
  PatientAudioCheckPage,
  DoctorConsultationPage,
  PatientConsultationPage,
  ConsultationRecordPage,
  NotFoundPage,
} from './pages/PlaceholderPage';

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/consultation/new" element={<DoctorSetupPage />} />
      <Route path="/join" element={<PatientJoinPage />} />
      <Route path="/join/:token" element={<PatientAudioCheckPage />} />
      <Route path="/doctor/:sessionId" element={<DoctorConsultationPage />} />
      <Route path="/patient/:sessionId" element={<PatientConsultationPage />} />
      <Route path="/record/:sessionId" element={<ConsultationRecordPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
