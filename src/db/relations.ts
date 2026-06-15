import { relations } from "drizzle-orm/relations";
import { clients, episodes, strategyGroups, strategyDocs, profiles, partnerInvites, partnerMeta, partners, vimoStaff, apps, appAccess, projects, partnerHistory, partnerIssues } from "./schema";

export const episodesRelations = relations(episodes, ({one}) => ({
	client: one(clients, {
		fields: [episodes.clientId],
		references: [clients.id]
	}),
}));

export const clientsRelations = relations(clients, ({many}) => ({
	episodes: many(episodes),
	projects: many(projects),
}));

export const strategyDocsRelations = relations(strategyDocs, ({one}) => ({
	strategyGroup: one(strategyGroups, {
		fields: [strategyDocs.groupId],
		references: [strategyGroups.id]
	}),
}));

export const strategyGroupsRelations = relations(strategyGroups, ({many}) => ({
	strategyDocs: many(strategyDocs),
}));

export const partnerInvitesRelations = relations(partnerInvites, ({one}) => ({
	profile_usedBy: one(profiles, {
		fields: [partnerInvites.usedBy],
		references: [profiles.id],
		relationName: "partnerInvites_usedBy_profiles_id"
	}),
	profile_invitedBy: one(profiles, {
		fields: [partnerInvites.invitedBy],
		references: [profiles.id],
		relationName: "partnerInvites_invitedBy_profiles_id"
	}),
}));

export const profilesRelations = relations(profiles, ({many}) => ({
	partnerInvites_usedBy: many(partnerInvites, {
		relationName: "partnerInvites_usedBy_profiles_id"
	}),
	partnerInvites_invitedBy: many(partnerInvites, {
		relationName: "partnerInvites_invitedBy_profiles_id"
	}),
	partnerMetas_legacyMappedBy: many(partnerMeta, {
		relationName: "partnerMeta_legacyMappedBy_profiles_id"
	}),
	partnerMetas_profileId: many(partnerMeta, {
		relationName: "partnerMeta_profileId_profiles_id"
	}),
	vimoStaffs: many(vimoStaff),
	appAccesses: many(appAccess),
}));

export const partnerMetaRelations = relations(partnerMeta, ({one}) => ({
	profile_legacyMappedBy: one(profiles, {
		fields: [partnerMeta.legacyMappedBy],
		references: [profiles.id],
		relationName: "partnerMeta_legacyMappedBy_profiles_id"
	}),
	partner: one(partners, {
		fields: [partnerMeta.legacyPartnerId],
		references: [partners.id]
	}),
	profile_profileId: one(profiles, {
		fields: [partnerMeta.profileId],
		references: [profiles.id],
		relationName: "partnerMeta_profileId_profiles_id"
	}),
}));

export const partnersRelations = relations(partners, ({many}) => ({
	partnerMetas: many(partnerMeta),
	partnerHistories: many(partnerHistory),
	partnerIssues: many(partnerIssues),
}));

export const vimoStaffRelations = relations(vimoStaff, ({one}) => ({
	profile: one(profiles, {
		fields: [vimoStaff.profileId],
		references: [profiles.id]
	}),
}));

export const appAccessRelations = relations(appAccess, ({one}) => ({
	app: one(apps, {
		fields: [appAccess.appCode],
		references: [apps.code]
	}),
	profile: one(profiles, {
		fields: [appAccess.userId],
		references: [profiles.id]
	}),
}));

export const appsRelations = relations(apps, ({many}) => ({
	appAccesses: many(appAccess),
}));

export const projectsRelations = relations(projects, ({one}) => ({
	client: one(clients, {
		fields: [projects.clientId],
		references: [clients.id]
	}),
}));

export const partnerHistoryRelations = relations(partnerHistory, ({one}) => ({
	partner: one(partners, {
		fields: [partnerHistory.partnerId],
		references: [partners.id]
	}),
}));

export const partnerIssuesRelations = relations(partnerIssues, ({one}) => ({
	partner: one(partners, {
		fields: [partnerIssues.partnerId],
		references: [partners.id]
	}),
}));