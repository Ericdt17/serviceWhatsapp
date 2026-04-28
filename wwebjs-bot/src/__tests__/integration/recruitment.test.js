'use strict';

const request = require('supertest');
const { createTestToken, createSuperAdminToken } = require('../helpers/createAuthToken');

// ---------------------------------------------------------------------------
// Mock cloudinary — use real multer with memory storage so multipart fields
// land in req.body (the passthrough trick skips multer parsing entirely).
// ---------------------------------------------------------------------------
jest.mock('../../config/cloudinary', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const multer = require('multer');
  return {
    cloudinary: {},
    upload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }),
    requireUploadMiddleware: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// DB mocks — recruitment functions
// ---------------------------------------------------------------------------
const mockRecruitmentListOpenJobs            = jest.fn();
const mockRecruitmentGetOpenJobOfferById     = jest.fn();
const mockRecruitmentGetJobOfferById         = jest.fn();
const mockRecruitmentListQuestionsForJobOffer = jest.fn();
const mockRecruitmentListAdminJobsWithCounts = jest.fn();
const mockRecruitmentCreateJobOffer          = jest.fn();
const mockRecruitmentUpdateJobOffer          = jest.fn();
const mockRecruitmentDeleteJobOffer          = jest.fn();
const mockRecruitmentCreateJobQuestion       = jest.fn();
const mockRecruitmentUpdateJobQuestion       = jest.fn();
const mockRecruitmentDeleteJobQuestion       = jest.fn();
const mockRecruitmentGetQuestionById         = jest.fn();
const mockRecruitmentListAdminApplications   = jest.fn();
const mockRecruitmentGetApplicationDetail    = jest.fn();
const mockRecruitmentUpdateApplication       = jest.fn();
const mockRecruitmentCreateApplicationWithAnswers = jest.fn();

jest.mock('../../db', () => ({
  adapter: { query: jest.fn(), type: 'sqlite' },
  // Recruitment
  recruitmentListOpenJobs:                mockRecruitmentListOpenJobs,
  recruitmentGetOpenJobOfferById:         mockRecruitmentGetOpenJobOfferById,
  recruitmentGetJobOfferById:             mockRecruitmentGetJobOfferById,
  recruitmentListQuestionsForJobOffer:    mockRecruitmentListQuestionsForJobOffer,
  recruitmentListAdminJobsWithCounts:     mockRecruitmentListAdminJobsWithCounts,
  recruitmentCreateJobOffer:              mockRecruitmentCreateJobOffer,
  recruitmentUpdateJobOffer:              mockRecruitmentUpdateJobOffer,
  recruitmentDeleteJobOffer:              mockRecruitmentDeleteJobOffer,
  recruitmentCountApplicationsForJob:     jest.fn(),
  recruitmentCreateJobQuestion:           mockRecruitmentCreateJobQuestion,
  recruitmentUpdateJobQuestion:           mockRecruitmentUpdateJobQuestion,
  recruitmentDeleteJobQuestion:           mockRecruitmentDeleteJobQuestion,
  recruitmentGetQuestionById:             mockRecruitmentGetQuestionById,
  recruitmentListAdminApplications:       mockRecruitmentListAdminApplications,
  recruitmentGetApplicationDetail:        mockRecruitmentGetApplicationDetail,
  recruitmentUpdateApplication:           mockRecruitmentUpdateApplication,
  recruitmentCreateApplicationWithAnswers: mockRecruitmentCreateApplicationWithAnswers,
  // Stubs for other mounted routes
  getAllDeliveries:            jest.fn(),
  getDeliveries:              jest.fn(),
  getDeliveryById:            jest.fn(),
  createDelivery:             jest.fn(),
  updateDelivery:             jest.fn(),
  deleteDelivery:             jest.fn(),
  getDeliveryHistory:         jest.fn(),
  saveHistory:                jest.fn(),
  getTariffByAgencyAndQuartier: jest.fn(),
  getDeliveryStats:           jest.fn(),
  getDailyStats:              jest.fn(),
  getAgencyByEmail:           jest.fn(),
  createAgency:               jest.fn(),
  getAllAgencies:              jest.fn(),
  getAgencyById:              jest.fn(),
  updateAgency:               jest.fn(),
  deleteAgency:               jest.fn(),
  findAgencyByCode:           jest.fn(),
  getAllGroups:                jest.fn(),
  getGroupsByAgency:          jest.fn(),
  getGroupById:               jest.fn(),
  createGroup:                jest.fn(),
  updateGroup:                jest.fn(),
  deleteGroup:                jest.fn(),
  hardDeleteGroup:            jest.fn(),
  getAllTariffs:               jest.fn(),
  getTariffsByAgency:         jest.fn(),
  getTariffById:              jest.fn(),
  createTariff:               jest.fn(),
  updateTariff:               jest.fn(),
  deleteTariff:               jest.fn(),
  searchDeliveries:           jest.fn(),
  createExpedition:           jest.fn(),
  getExpeditions:             jest.fn(),
  getExpeditionById:          jest.fn(),
  updateExpedition:           jest.fn(),
  deleteExpedition:           jest.fn(),
  getExpeditionStats:         jest.fn(),
  createAgencyReminderContact:    jest.fn(),
  getAgencyReminderContacts:      jest.fn(),
  getAgencyReminderContactById:   jest.fn(),
  updateAgencyReminderContact:    jest.fn(),
  deleteAgencyReminderContact:    jest.fn(),
  createReminder:             jest.fn(),
  getReminders:               jest.fn(),
  getReminderById:            jest.fn(),
  getReminderTargets:         jest.fn(),
  cancelReminder:             jest.fn(),
  deleteReminder:             jest.fn(),
  retryReminderFailed:        jest.fn(),
  getAllActiveGroupsForBroadcast: jest.fn(),
  getWaitlistEntries:         jest.fn(),
  insertWaitlistEntry:        jest.fn(),
  getVendorsByAgency:         jest.fn(),
  upsertVendorPushToken:      jest.fn(),
  deleteVendorPushToken:      jest.fn(),
  deleteAllVendorPushTokens:  jest.fn(),
  getExpoPushTokensForVendorUserIds: jest.fn(),
  getStockItems:              jest.fn(),
  getStockItemById:           jest.fn(),
  createStockItem:            jest.fn(),
  updateStockItemQuantity:    jest.fn(),
  setStockItemQuantity:       jest.fn(),
  deleteStockItem:            jest.fn(),
}));

const app        = require('../../api/server');
const agencyToken = createTestToken({ userId: 1, agencyId: 1 });
const superToken  = createSuperAdminToken({ userId: 99, agencyId: null });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const jobFixture = {
  id: 1,
  agency_id: null,
  title: 'Livreur Douala',
  type: 'livreur',
  description: 'Livraison moto',
  location: 'Douala',
  slots: 3,
  is_open: true,
  created_at: '2026-04-18T10:00:00.000Z',
};

const questionFixture = {
  id: 10,
  job_offer_id: 1,
  question_text: 'Avez-vous une moto ?',
  question_type: 'text',
  options: null,
  is_required: true,
  order_index: 1,
};

const mcqQuestionFixture = {
  id: 11,
  job_offer_id: 1,
  question_text: 'Disponibilité ?',
  question_type: 'mcq',
  options: ['matin', 'soir', 'week-end'],
  is_required: false,
  order_index: 2,
};

const applicationFixture = {
  id: 100,
  job_offer_id: 1,
  full_name: 'Jean Dupont',
  phone: '699000001',
  transport: 'scooter',
  availability: 'plein',
  status: 'new',
  funnel_step: 1,
  cv_url: null,
};

// ---------------------------------------------------------------------------
// Public — GET /api/v1/recruitment/jobs
// ---------------------------------------------------------------------------
describe('GET /api/v1/recruitment/jobs', () => {
  it('returns empty array when no open jobs', async () => {
    mockRecruitmentListOpenJobs.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/recruitment/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('returns list of open jobs', async () => {
    mockRecruitmentListOpenJobs.mockResolvedValueOnce([jobFixture]);
    const res = await request(app).get('/api/v1/recruitment/jobs');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Public — GET /api/v1/recruitment/jobs/:id
// ---------------------------------------------------------------------------
describe('GET /api/v1/recruitment/jobs/:id', () => {
  it('returns 404 when job not found or closed', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v1/recruitment/jobs/999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns public job fields for an open job', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    const res = await request(app).get('/api/v1/recruitment/jobs/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      id: jobFixture.id,
      title: jobFixture.title,
      type: jobFixture.type,
      description: jobFixture.description,
      location: jobFixture.location,
      slots: jobFixture.slots,
    });
  });
});

// ---------------------------------------------------------------------------
// Public — GET /api/v1/recruitment/jobs/:id/questions
// ---------------------------------------------------------------------------
describe('GET /api/v1/recruitment/jobs/:id/questions', () => {
  it('returns 404 for a closed or unknown job', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v1/recruitment/jobs/999/questions');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns questions for an open job', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([questionFixture]);
    const res = await request(app).get('/api/v1/recruitment/jobs/1/questions');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].question_text).toBe('Avez-vous une moto ?');
  });
});

// ---------------------------------------------------------------------------
// Public — POST /api/v1/recruitment/apply
// ---------------------------------------------------------------------------
describe('POST /api/v1/recruitment/apply', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('full_name', 'Jean')
      // missing job_offer_id and phone
    ;
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when job is closed or not found', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no longer open/i);
  });

  it('returns 400 when answers JSON is malformed', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001')
      .field('answers', '{not json}');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid JSON/i);
  });

  it('does not require answers even if job has required questions (front may not ask them)', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([questionFixture]);
    mockRecruitmentCreateApplicationWithAnswers.mockResolvedValueOnce({ id: 100 });
    // no answers provided
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001')
      .field('answers', '[]');
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(100);
  });

  it('returns 400 when MCQ answer is not in options', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([mcqQuestionFixture]);
    const answers = JSON.stringify([{ question_id: 11, answer_text: 'invalide' }]);
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001')
      .field('answers', answers);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid mcq answer/i);
  });

  it('returns 400 when answers reference a question not in this job', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([questionFixture]); // only q 10
    const answers = JSON.stringify([{ question_id: 999, answer_text: 'x' }]);
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001')
      .field('answers', answers);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong/i);
  });

  it('creates application and returns 201 with id', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([questionFixture]);
    mockRecruitmentCreateApplicationWithAnswers.mockResolvedValueOnce({ id: 100 });
    const answers = JSON.stringify([{ question_id: 10, answer_text: 'Oui' }]);
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001')
      .field('answers', answers);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(100);
  });

  it('accepts optional photo field (multipart)', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([]);
    mockRecruitmentCreateApplicationWithAnswers.mockResolvedValueOnce({ id: 100 });
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001')
      .field('answers', '[]')
      .attach('photo', Buffer.from('fakejpeg'), {
        filename: 'face.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(201);
    expect(mockRecruitmentCreateApplicationWithAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        job_offer_id: 1,
        photo_original_name: 'face.jpg',
      })
    );
  });

  it('accepts profile_photo field as alias for photo (multipart)', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([]);
    mockRecruitmentCreateApplicationWithAnswers.mockResolvedValueOnce({ id: 100 });
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000020')
      .field('answers', '[]')
      .attach('profile_photo', Buffer.from('fakejpeg'), {
        filename: 'alias_photo.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(201);
    expect(mockRecruitmentCreateApplicationWithAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        job_offer_id: 1,
        photo_original_name: 'alias_photo.jpg',
      })
    );
  });

  it('accepts picture field as alias for photo (multipart)', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([]);
    mockRecruitmentCreateApplicationWithAnswers.mockResolvedValueOnce({ id: 100 });
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000021')
      .field('answers', '[]')
      .attach('picture', Buffer.from('fakepng'), {
        filename: 'pic.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);
    expect(mockRecruitmentCreateApplicationWithAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        job_offer_id: 1,
        photo_original_name: 'pic.png',
      })
    );
  });

  it('accepts photo and cv in the same multipart request', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([]);
    mockRecruitmentCreateApplicationWithAnswers.mockResolvedValueOnce({ id: 100 });
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000022')
      .field('answers', '[]')
      .attach('photo', Buffer.from('fakejpeg'), {
        filename: 'face.jpg',
        contentType: 'image/jpeg',
      })
      .attach('cv', Buffer.from('%PDF-1.4 minimal'), {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    expect(mockRecruitmentCreateApplicationWithAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        job_offer_id: 1,
        photo_original_name: 'face.jpg',
        cv_original_name: 'cv.pdf',
      })
    );
  });

  it('accepts job_id and neighborhood as aliases for job_offer_id and quartier', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([]);
    mockRecruitmentCreateApplicationWithAnswers.mockResolvedValueOnce({ id: 101 });
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001')
      .field('neighborhood', 'Bonamoussadi')
      .field('answers', '[]');
    expect(res.status).toBe(201);
    expect(mockRecruitmentCreateApplicationWithAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        job_offer_id: 1,
        quartier: 'Bonamoussadi',
      })
    );
  });

  it('returns 409 on duplicate application (phone + job)', async () => {
    mockRecruitmentGetOpenJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([]);
    const pgError = new Error('duplicate key');
    pgError.code = '23505';
    mockRecruitmentCreateApplicationWithAnswers.mockRejectedValueOnce(pgError);
    const res = await request(app)
      .post('/api/v1/recruitment/apply')
      .field('job_offer_id', '1')
      .field('full_name', 'Jean Dupont')
      .field('phone', '699000001')
      .field('answers', '[]');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already applied/i);
  });
});

// ---------------------------------------------------------------------------
// Admin — auth guard
// ---------------------------------------------------------------------------
describe('Admin routes — auth guard', () => {
  it('returns 401 on GET /admin/jobs without token', async () => {
    const res = await request(app).get('/api/v1/recruitment/admin/jobs');
    expect(res.status).toBe(401);
  });

  it('returns 401 on POST /admin/jobs without token', async () => {
    const res = await request(app).post('/api/v1/recruitment/admin/jobs').send({});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Admin — GET /api/v1/recruitment/admin/jobs
// ---------------------------------------------------------------------------
describe('GET /api/v1/recruitment/admin/jobs', () => {
  it('returns all jobs with application counts for agency user', async () => {
    mockRecruitmentListAdminJobsWithCounts.mockResolvedValueOnce([{ ...jobFixture, application_count: '2' }]);
    const res = await request(app)
      .get('/api/v1/recruitment/admin/jobs')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('also works for super_admin', async () => {
    mockRecruitmentListAdminJobsWithCounts.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/v1/recruitment/admin/jobs')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Admin — POST /api/v1/recruitment/admin/jobs
// ---------------------------------------------------------------------------
describe('POST /api/v1/recruitment/admin/jobs', () => {
  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/admin/jobs')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ type: 'livreur' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when type is blank', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/admin/jobs')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ title: 'Test', type: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when type exceeds max length', async () => {
    const res = await request(app)
      .post('/api/v1/recruitment/admin/jobs')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ title: 'Test', type: 'x'.repeat(51) });
    expect(res.status).toBe(400);
  });

  it('creates a new job and returns 201', async () => {
    mockRecruitmentCreateJobOffer.mockResolvedValueOnce(jobFixture);
    const res = await request(app)
      .post('/api/v1/recruitment/admin/jobs')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ title: 'Livreur Douala', type: 'livreur' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Livreur Douala');
  });
});

// ---------------------------------------------------------------------------
// Admin — PATCH /api/v1/recruitment/admin/jobs/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/v1/recruitment/admin/jobs/:id', () => {
  it('returns 404 when job does not exist', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(null);
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/jobs/999')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ is_open: false });
    expect(res.status).toBe(404);
  });

  it('updates job fields and returns updated row', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentUpdateJobOffer.mockResolvedValueOnce({ ...jobFixture, is_open: false });
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/jobs/1')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ is_open: false });
    expect(res.status).toBe(200);
    expect(res.body.data.is_open).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Admin — DELETE /api/v1/recruitment/admin/jobs/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/v1/recruitment/admin/jobs/:id', () => {
  it('returns 404 when job does not exist', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/v1/recruitment/admin/jobs/999')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 when job has applications', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentDeleteJobOffer.mockResolvedValueOnce({ deleted: false, reason: 'has_applications' });
    const res = await request(app)
      .delete('/api/v1/recruitment/admin/jobs/1')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/applications linked/i);
  });

  it('deletes job and returns id', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentDeleteJobOffer.mockResolvedValueOnce({ deleted: true, id: 1 });
    const res = await request(app)
      .delete('/api/v1/recruitment/admin/jobs/1')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Admin — GET /api/v1/recruitment/admin/jobs/:id/questions
// ---------------------------------------------------------------------------
describe('GET /api/v1/recruitment/admin/jobs/:id/questions', () => {
  it('returns 404 when job does not exist', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/v1/recruitment/admin/jobs/999/questions')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(404);
  });

  it('returns questions for job', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentListQuestionsForJobOffer.mockResolvedValueOnce([questionFixture]);
    const res = await request(app)
      .get('/api/v1/recruitment/admin/jobs/1/questions')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Admin — POST /api/v1/recruitment/admin/jobs/:id/questions
// ---------------------------------------------------------------------------
describe('POST /api/v1/recruitment/admin/jobs/:id/questions', () => {
  it('returns 404 when job does not exist', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/v1/recruitment/admin/jobs/999/questions')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ question_text: 'Avez-vous une moto ?', question_type: 'text' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when mcq question has no options', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(jobFixture);
    const res = await request(app)
      .post('/api/v1/recruitment/admin/jobs/1/questions')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ question_text: 'Disponibilité ?', question_type: 'mcq' }); // no options
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.options).toBeDefined();
  });

  it('creates a text question and returns 201', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentCreateJobQuestion.mockResolvedValueOnce(questionFixture);
    const res = await request(app)
      .post('/api/v1/recruitment/admin/jobs/1/questions')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ question_text: 'Avez-vous une moto ?', question_type: 'text' });
    expect(res.status).toBe(201);
    expect(res.body.data.question_type).toBe('text');
  });

  it('creates an mcq question with options and returns 201', async () => {
    mockRecruitmentGetJobOfferById.mockResolvedValueOnce(jobFixture);
    mockRecruitmentCreateJobQuestion.mockResolvedValueOnce(mcqQuestionFixture);
    const res = await request(app)
      .post('/api/v1/recruitment/admin/jobs/1/questions')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ question_text: 'Disponibilité ?', question_type: 'mcq', options: ['matin', 'soir'] });
    expect(res.status).toBe(201);
    expect(res.body.data.question_type).toBe('mcq');
  });
});

// ---------------------------------------------------------------------------
// Admin — PATCH /api/v1/recruitment/admin/questions/:questionId
// ---------------------------------------------------------------------------
describe('PATCH /api/v1/recruitment/admin/questions/:questionId', () => {
  it('returns 404 when question does not exist', async () => {
    mockRecruitmentGetQuestionById.mockResolvedValueOnce(null);
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/questions/999')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ is_required: false });
    expect(res.status).toBe(404);
  });

  it('updates question and returns updated row', async () => {
    mockRecruitmentGetQuestionById.mockResolvedValueOnce(questionFixture);
    mockRecruitmentUpdateJobQuestion.mockResolvedValueOnce({ ...questionFixture, is_required: false });
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/questions/10')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ is_required: false });
    expect(res.status).toBe(200);
    expect(res.body.data.is_required).toBe(false);
  });

  it('clears options when question_type is patched to text', async () => {
    const mcqQuestion = { ...mcqQuestionFixture };
    mockRecruitmentGetQuestionById.mockResolvedValueOnce(mcqQuestion);
    mockRecruitmentUpdateJobQuestion.mockResolvedValueOnce({ ...mcqQuestion, question_type: 'text', options: null });
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/questions/11')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ question_type: 'text' });
    expect(res.status).toBe(200);
    // controller sets options=null when patching type to text
    expect(mockRecruitmentUpdateJobQuestion).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ question_type: 'text', options: null }),
    );
  });
});

// ---------------------------------------------------------------------------
// Admin — DELETE /api/v1/recruitment/admin/questions/:questionId
// ---------------------------------------------------------------------------
describe('DELETE /api/v1/recruitment/admin/questions/:questionId', () => {
  it('returns 404 when question does not exist', async () => {
    mockRecruitmentDeleteJobQuestion.mockResolvedValueOnce({ deleted: false });
    const res = await request(app)
      .delete('/api/v1/recruitment/admin/questions/999')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(404);
  });

  it('deletes question and returns id', async () => {
    mockRecruitmentDeleteJobQuestion.mockResolvedValueOnce({ deleted: true, id: 10 });
    const res = await request(app)
      .delete('/api/v1/recruitment/admin/questions/10')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Admin — GET /api/v1/recruitment/admin/applications
// ---------------------------------------------------------------------------
describe('GET /api/v1/recruitment/admin/applications', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/recruitment/admin/applications');
    expect(res.status).toBe(401);
  });

  it('returns application list for agency', async () => {
    mockRecruitmentListAdminApplications.mockResolvedValueOnce([applicationFixture]);
    const res = await request(app)
      .get('/api/v1/recruitment/admin/applications')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('passes query filters to the db function', async () => {
    mockRecruitmentListAdminApplications.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/v1/recruitment/admin/applications?status=new&job_offer_id=1')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(200);
    expect(mockRecruitmentListAdminApplications).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'new', job_offer_id: '1' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Admin — GET /api/v1/recruitment/admin/applications/:id
// ---------------------------------------------------------------------------
describe('GET /api/v1/recruitment/admin/applications/:id', () => {
  it('returns 404 when application does not exist', async () => {
    mockRecruitmentGetApplicationDetail.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/v1/recruitment/admin/applications/999')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(404);
  });

  it('returns application detail', async () => {
    const detail = { ...applicationFixture, answers: [] };
    mockRecruitmentGetApplicationDetail.mockResolvedValueOnce(detail);
    const res = await request(app)
      .get('/api/v1/recruitment/admin/applications/100')
      .set('Authorization', `Bearer ${agencyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Admin — PATCH /api/v1/recruitment/admin/applications/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/v1/recruitment/admin/applications/:id', () => {
  it('returns 400 for invalid status enum', async () => {
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/applications/100')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ status: 'hired' }); // not in enum
    expect(res.status).toBe(400);
  });

  it('returns 400 for out-of-range funnel_step', async () => {
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/applications/100')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ funnel_step: 10 }); // max is 6
    expect(res.status).toBe(400);
  });

  it('returns 404 when application does not exist', async () => {
    mockRecruitmentUpdateApplication.mockResolvedValueOnce(null);
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/applications/999')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ status: 'in_review' });
    expect(res.status).toBe(404);
  });

  it('updates status and returns updated application', async () => {
    mockRecruitmentUpdateApplication.mockResolvedValueOnce({ ...applicationFixture, status: 'in_review' });
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/applications/100')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ status: 'in_review' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in_review');
  });

  it('updates score and notes', async () => {
    mockRecruitmentUpdateApplication.mockResolvedValueOnce({ ...applicationFixture, score: 15, notes: 'Bon candidat' });
    const res = await request(app)
      .patch('/api/v1/recruitment/admin/applications/100')
      .set('Authorization', `Bearer ${agencyToken}`)
      .send({ score: 15, notes: 'Bon candidat' });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(15);
  });
});
