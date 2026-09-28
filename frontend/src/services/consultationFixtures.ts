import type { ConsultationSessionState, ConversationTurn } from '../types/consultation.ts';

export const FIXTURE_DOCTOR_NOTICE =
  'Development preview: showing simulated conversation fixtures. Not connected to a live session.';

export const FIXTURE_PATIENT_NOTICE =
  'डेवलपमेंट पूर्वावलोकन: सिम्युलेटेड बातचीत दिखाई जा रही है। लाइव सत्र से जुड़ा नहीं है।';

export const CLINICAL_DISCLAIMER_EN =
  'Prototype interpretation aid. Not for clinical diagnosis or prescription.';

export const CLINICAL_DISCLAIMER_HI =
  'प्रोटोटाइप व्याख्या सहायता। नैदानिक ​​निदान या दवा निर्धारण के लिए नहीं।';

export const INITIAL_CONVERSATION_TURNS: ConversationTurn[] = [
  {
    id: 'turn-1',
    timestamp: '10:32 AM',
    speakerRole: 'doctor',
    originalText: 'Hello Mr. Kumar, I am Dr. Sharma. How are you feeling today?',
    originalLanguage: 'en',
    translatedText: 'नमस्ते श्री कुमार, मैं डॉ. शर्मा हूँ। आज आप कैसा महसूस कर रहे हैं?',
    translatedLanguage: 'hi',
    status: 'completed',
  },
  {
    id: 'turn-2',
    timestamp: '10:33 AM',
    speakerRole: 'patient',
    originalText: 'नमस्ते डॉक्टर साहब। मुझे पिछले तीन दिनों से हल्का बुखार और गले में खराश है।',
    originalLanguage: 'hi',
    translatedText: 'Hello doctor. I have had a mild fever and a sore throat for the past three days.',
    translatedLanguage: 'en',
    status: 'completed',
  },
  {
    id: 'turn-3',
    timestamp: '10:33 AM',
    speakerRole: 'doctor',
    originalText: 'I understand. Have you taken any medications so far, like paracetamol?',
    originalLanguage: 'en',
    translatedText: 'मैं समझ गया। क्या आपने अब तक कोई दवा ली है, जैसे पेरासिटामोल?',
    translatedLanguage: 'hi',
    status: 'completed',
  },
  {
    id: 'turn-4',
    timestamp: '10:34 AM',
    speakerRole: 'patient',
    originalText: 'जी हाँ, मैंने कल रात एक 500 मिलीग्राम की पेरासिटामोल ली थी।',
    originalLanguage: 'hi',
    translatedText: 'Yes, I took one 500 milligram paracetamol last night.',
    translatedLanguage: 'en',
    status: 'completed',
    confirmation: {
      promptText: 'Paracetamol 500mg taken last night',
      outcome: 'confirmed',
      responderRole: 'patient',
      userActionLabel: 'Confirmed by patient',
    },
  },
  {
    id: 'turn-5',
    timestamp: '10:35 AM',
    speakerRole: 'doctor',
    originalText: 'Thank you for confirming. Do you have any difficulty swallowing or shortness of breath?',
    originalLanguage: 'en',
    translatedText: 'पुष्टि के लिए धन्यवाद। क्या आपको निगलने में कठिनाई या सांस लेने में तकलीफ़ हो रही है?',
    translatedLanguage: 'hi',
    status: 'completed',
  },
];

export function createFixtureSession(
  sessionId: string,
  role: 'doctor' | 'patient',
  overrides?: Partial<ConsultationSessionState>
): ConsultationSessionState {
  const isDoctor = role === 'doctor';
  return {
    sessionId,
    status: 'active',
    connectionStatus: 'connected',
    activityState: 'idle',
    isFixture: true,
    fixtureNotice: isDoctor ? FIXTURE_DOCTOR_NOTICE : FIXTURE_PATIENT_NOTICE,
    liveAudioAvailable: false,
    doctor: {
      participantId: 'doc-fixture-1',
      role: 'doctor',
      connectionStatus: 'connected',
      isMuted: false,
    },
    patient: {
      participantId: 'pat-fixture-2',
      role: 'patient',
      connectionStatus: 'connected',
      isMuted: false,
    },
    turns: [...INITIAL_CONVERSATION_TURNS],
    currentTurn: null,
    isMuted: false,
    errorMessage: null,
    verifiedFacts: [],
    emergencyAlert: null,
    repetitionRequest: null,
    ...overrides,
  };
}
