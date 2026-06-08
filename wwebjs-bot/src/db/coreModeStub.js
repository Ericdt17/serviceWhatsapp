"use strict";

const LEGACY_DB_ERROR =
  "Database not configured — set DATABASE_URL for legacy mode or disable USE_CORE_API";

function rejectLegacy() {
  return Promise.reject(new Error(LEGACY_DB_ERROR));
}

function rejectLegacySync() {
  throw new Error(LEGACY_DB_ERROR);
}

/**
 * No-op DB export for USE_CORE_API gateway-only bot (no local Postgres).
 * Methods reject if called — core handlers should not reach them.
 */
function createCoreModeStub() {
  const adapter = {
    type: "stub",
    query: rejectLegacy,
    close: async () => undefined,
    getRawDb: () => null,
  };

  const asyncFn = () => rejectLegacy();

  return {
    db: null,
    adapter,
    insertDelivery: asyncFn,
    createDelivery: asyncFn,
    bulkCreateDeliveries: asyncFn,
    updateDelivery: asyncFn,
    updateDeliveryByMessageId: asyncFn,
    getDeliveries: asyncFn,
    getAllDeliveries: asyncFn,
    getDeliveryById: asyncFn,
    createExpedition: asyncFn,
    getExpeditions: asyncFn,
    getExpeditionById: asyncFn,
    updateExpedition: asyncFn,
    deleteExpedition: asyncFn,
    getExpeditionStats: asyncFn,
    getDailyStats: asyncFn,
    getDeliveryStats: asyncFn,
    getDeliveryHistory: asyncFn,
    getTodayDeliveries: asyncFn,
    findDeliveryByPhone: asyncFn,
    findDeliveryByPhoneForUpdate: asyncFn,
    findDeliveryByMessageId: asyncFn,
    searchDeliveries: asyncFn,
    saveHistory: asyncFn,
    deleteDelivery: asyncFn,
    addHistory: asyncFn,
    createAgency: asyncFn,
    getAgencyById: asyncFn,
    getAgencyByEmail: asyncFn,
    findAgencyByCode: asyncFn,
    getAllAgencies: asyncFn,
    updateAgency: asyncFn,
    deleteAgency: asyncFn,
    getVendorsByAgency: asyncFn,
    createAgencyReminderContact: asyncFn,
    getAgencyReminderContacts: asyncFn,
    getAgencyReminderContactById: asyncFn,
    updateAgencyReminderContact: asyncFn,
    deleteAgencyReminderContact: asyncFn,
    createReminder: asyncFn,
    createReminderCampaign: asyncFn,
    getReminders: asyncFn,
    getReminderById: asyncFn,
    getReminderTargets: asyncFn,
    cancelReminder: asyncFn,
    deleteReminder: asyncFn,
    retryReminderFailed: asyncFn,
    pollQueuedReminderTargets: asyncFn,
    markReminderTargetProcessing: asyncFn,
    updateReminderTargetStatus: asyncFn,
    markReminderSent: asyncFn,
    markReminderFailed: asyncFn,
    getDueReminders: asyncFn,
    setReminderTotals: asyncFn,
    createGroup: asyncFn,
    getGroupById: asyncFn,
    getGroupsByAgency: asyncFn,
    getAllGroups: asyncFn,
    getAllActiveGroupsForBroadcast: asyncFn,
    updateGroup: asyncFn,
    deleteGroup: asyncFn,
    hardDeleteGroup: asyncFn,
    createTariff: asyncFn,
    getTariffById: asyncFn,
    getTariffByAgencyAndQuartier: asyncFn,
    getTariffsByAgency: asyncFn,
    getAllTariffs: asyncFn,
    updateTariff: asyncFn,
    deleteTariff: asyncFn,
    getStockItems: asyncFn,
    getStockItemById: asyncFn,
    createStockItem: asyncFn,
    updateStockItemQuantity: asyncFn,
    setStockItemQuantity: asyncFn,
    deleteStockItem: asyncFn,
    upsertVendorPushToken: asyncFn,
    deleteVendorPushToken: asyncFn,
    deleteAllVendorPushTokens: asyncFn,
    getExpoPushTokensForVendorUserIds: asyncFn,
    getWaitlistEntries: asyncFn,
    insertWaitlistEntry: asyncFn,
    recruitmentListOpenJobs: asyncFn,
    recruitmentGetJobOfferById: asyncFn,
    recruitmentGetOpenJobOfferById: asyncFn,
    recruitmentListQuestionsForJobOffer: asyncFn,
    recruitmentListAdminJobsWithCounts: asyncFn,
    recruitmentCreateJobOffer: asyncFn,
    recruitmentUpdateJobOffer: asyncFn,
    recruitmentDeleteJobOffer: asyncFn,
    recruitmentCountApplicationsForJob: asyncFn,
    recruitmentCreateJobQuestion: asyncFn,
    recruitmentUpdateJobQuestion: asyncFn,
    recruitmentDeleteJobQuestion: asyncFn,
    recruitmentGetQuestionById: asyncFn,
    recruitmentListAdminApplications: asyncFn,
    recruitmentGetApplicationDetail: asyncFn,
    recruitmentUpdateApplication: asyncFn,
    recruitmentCreateApplicationWithAnswers: asyncFn,
    close: adapter.close,
    getRawDb: adapter.getRawDb,
  };
}

module.exports = {
  createCoreModeStub,
  LEGACY_DB_ERROR,
  rejectLegacySync,
};
