import { pgTable, index, uuid, text, jsonb, timestamp, boolean, integer, unique, foreignKey, numeric, date, bigint, check, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const trash = pgTable("trash", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	type: text().notNull(),
	data: jsonb().notNull(),
	originalProjectId: text("original_project_id"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_trash_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const checklists = pgTable("checklists", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").default('local').notNull(),
	text: text().notNull(),
	completed: boolean().default(false).notNull(),
	reminderTime: text("reminder_time"),
	notified: boolean().default(false).notNull(),
	repeatType: text("repeat_type"),
	repeatDays: integer("repeat_days").array(),
	linkedEpisodeId: text("linked_episode_id"),
	linkedEpisodeTitle: text("linked_episode_title"),
	linkedEpisodeNumber: integer("linked_episode_number"),
	linkedProjectId: text("linked_project_id"),
	linkedProjectTitle: text("linked_project_title"),
	linkedClientName: text("linked_client_name"),
	linkedPartnerId: text("linked_partner_id"),
	linkedPartnerName: text("linked_partner_name"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_checklists_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const feedback = pgTable("feedback", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	content: text().notNull(),
	pagePath: text("page_path"),
	status: text().default('pending'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const clients = pgTable("clients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	contactPerson: text("contact_person"),
	email: text(),
	phone: text(),
	company: text(),
	address: text(),
	status: text().default('active').notNull(),
	notes: text(),
	// 세금계산서(홈택스) 발행 도우미용 사업자정보
	businessNumber: text("business_number"),
	corpName: text("corp_name"),
	ceoName: text("ceo_name"),
	bizType: text("biz_type"),
	bizItem: text("biz_item"),
	taxEmail: text("tax_email"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const customRoles = pgTable("custom_roles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("custom_roles_name_key").on(table.name),
]);

export const episodes = pgTable("episodes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: text("project_id").notNull(),
	episodeNumber: integer("episode_number").notNull(),
	title: text().notNull(),
	description: text(),
	client: text(),
	workContent: text("work_content").array(),
	workItems: jsonb("work_items"),
	status: text().default('waiting').notNull(),
	assignee: text(),
	manager: text(),
	startDate: text("start_date"),
	endDate: text("end_date"),
	dueDate: text("due_date"),
	budgetTotal: numeric("budget_total").default('0'),
	budgetPartner: numeric("budget_partner").default('0'),
	budgetManagement: numeric("budget_management").default('0'),
	workSteps: jsonb("work_steps"),
	workBudgets: jsonb("work_budgets"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	paymentDueDate: text("payment_due_date"),
	paymentStatus: text("payment_status").default('pending'),
	paymentDate: text("payment_date"),
	invoiceDate: text("invoice_date"),
	invoiceStatus: text("invoice_status").default('pending'),
	clientId: uuid("client_id"),
}, (table) => [
	index("idx_episodes_project_id").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "episodes_client_id_fkey"
		}),
	unique("episodes_project_episode_number_unique").on(table.projectId, table.episodeNumber),
]);

export const expenses = pgTable("expenses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	amount: numeric().default('0').notNull(),
	category: text().default('기타').notNull(),
	expenseDate: date("expense_date").default(sql`CURRENT_DATE`).notNull(),
	description: text(),
	spenderName: text("spender_name"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	paymentType: text("payment_type").default('one_time').notNull(),
	nextRenewalDate: date("next_renewal_date"),
	status: text().default('active').notNull(),
	cancelReason: text("cancel_reason"),
});

export const blogPosts = pgTable("blog_posts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	content: text().default('').notNull(),
	excerpt: text(),
	slug: text().notNull(),
	status: text().default('draft').notNull(),
	tags: text().array().default([]),
	featuredImage: text("featured_image"),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const planhighContactRequests = pgTable("planhigh_contact_requests", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "planhigh_contact_requests_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	hospitalName: text("hospital_name").notNull(),
	contactName: text("contact_name").notNull(),
	phone: text().notNull(),
	email: text(),
	service: text(),
	message: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const strategyGroups = pgTable("strategy_groups", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	emoji: text().default('📁').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const strategyDocs = pgTable("strategy_docs", {
	id: text().primaryKey().notNull(),
	groupId: text("group_id").notNull(),
	title: text().default('새 페이지').notNull(),
	emoji: text().default('📝').notNull(),
	blocks: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [strategyGroups.id],
			name: "strategy_docs_group_id_fkey"
		}).onDelete("cascade"),
]);

export const inquiries = pgTable("inquiries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text(),
	phone: text().notNull(),
	projectType: text("project_type").notNull(),
	budget: text(),
	message: text().notNull(),
	referencesLinks: text("references_links").array().default([]),
	portfolioReferences: jsonb("portfolio_references").default([]),
	referralSource: text("referral_source"),
	status: text().default('new'),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const planhighSiteContent = pgTable("planhigh_site_content", {
	id: integer().default(1).primaryKey().notNull(),
	content: jsonb().default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	check("single_row", sql`id = 1`),
]);

// planhigh 전용 어드민 (ERP user_profiles 와 독립). Supabase GoTrue 대체.
export const planhighAdmins = pgTable("planhigh_admins", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("ux_planhigh_admins_email_lower").using("btree", sql`lower(email)`),
]);

export const sentEmails = pgTable("sent_emails", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	senderId: uuid("sender_id"),
	senderEmail: text("sender_email").notNull(),
	to: text().array().notNull(),
	cc: text().array(),
	bcc: text().array(),
	subject: text().notNull(),
	content: text().notNull(),
	status: text().default('sent').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 메일 주소 디렉토리 — catch-all 수신을 직원별/공용함으로 분류하는 기준.
// type: personal(개인, owner_user_id) | shared(공용, members가 담당자)
export const mailAddresses = pgTable("mail_addresses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	address: text().notNull(),
	type: text().default('personal').notNull(),
	ownerUserId: uuid("owner_user_id"),
	label: text(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("ux_mail_addresses_address_lower").using("btree", sql`lower(address)`),
]);

export const mailAddressMembers = pgTable("mail_address_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	addressId: uuid("address_id").notNull(),
	userId: uuid("user_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("ux_mail_address_members_pair").using("btree", table.addressId.asc().nullsLast(), table.userId.asc().nullsLast()),
]);

// 메일 읽음 상태 — 사용자별(per-user) 읽음 표시. mail_uid = 받은 메일 고유키(inbound.ts uid).
// FK 없음(sent_emails 선례). 같은 (user_id, mail_uid)는 유니크 — 멱등 upsert(onConflictDoNothing).
export const mailReadStatus = pgTable("mail_read_status", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	mailUid: text("mail_uid").notNull(),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("ux_mail_read_status_user_uid").using("btree", table.userId.asc().nullsLast(), table.mailUid.asc().nullsLast()),
]);

export const auditLog = pgTable("audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tableName: text("table_name").notNull(),
	rowId: uuid("row_id"),
	action: text().notNull(),
	actorId: uuid("actor_id"),
	diff: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_audit_log_actor").using("btree", table.actorId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_audit_log_table_row").using("btree", table.tableName.asc().nullsLast().op("text_ops"), table.rowId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("uuid_ops")),
	check("audit_log_action_check", sql`action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])`),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	endpoint: text().notNull(),
	p256Dh: text("p256dh").notNull(),
	auth: text().notNull(),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_push_subscriptions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	unique("push_subscriptions_endpoint_key").on(table.endpoint),
]);

export const partnerInvites = pgTable("partner_invites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	token: text().notNull(),
	invitedEmail: text("invited_email"),
	invitedName: text("invited_name"),
	invitedBy: uuid("invited_by"),
	legacyHintId: uuid("legacy_hint_id"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).default(sql`(now() + '7 days'::interval)`).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
	usedBy: uuid("used_by"),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_partner_invites_status_expires").using("btree", table.status.asc().nullsLast().op("text_ops"), table.expiresAt.asc().nullsLast().op("text_ops")),
	index("idx_partner_invites_token").using("btree", table.token.asc().nullsLast().op("text_ops")).where(sql`(status = 'pending'::text)`),
	foreignKey({
			columns: [table.usedBy],
			foreignColumns: [profiles.id],
			name: "partner_invites_used_by_fkey"
		}),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [profiles.id],
			name: "partner_invites_invited_by_fkey"
		}),
	unique("partner_invites_token_key").on(table.token),
	check("partner_invites_status_check", sql`status = ANY (ARRAY['pending'::text, 'used'::text, 'expired'::text, 'revoked'::text])`),
]);

export const appUpdates = pgTable("app_updates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	app: text().notNull(),
	version: text().notNull(),
	title: text().notNull(),
	date: date().default(sql`CURRENT_DATE`).notNull(),
	tag: text(),
	changes: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_app_updates_app_date").using("btree", table.app.asc().nullsLast().op("date_ops"), table.date.asc().nullsLast().op("date_ops")),
	check("app_updates_app_check", sql`app = ANY (ARRAY['erp'::text, 'bibot'::text])`),
]);

export const partnerMeta = pgTable("partner_meta", {
	profileId: uuid("profile_id").primaryKey().notNull(),
	type: text().notNull(),
	tier: text(),
	bankName: text("bank_name"),
	bankAccount: text("bank_account"),
	bankHolder: text("bank_holder"),
	workFormats: text("work_formats").array().default([]).notNull(),
	status: text().default('pending').notNull(),
	startedAt: date("started_at"),
	legacyPartnerId: uuid("legacy_partner_id"),
	legacyMappedAt: timestamp("legacy_mapped_at", { withTimezone: true, mode: 'string' }),
	legacyMappedBy: uuid("legacy_mapped_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_partner_meta_legacy").using("btree", table.legacyPartnerId.asc().nullsLast().op("uuid_ops")).where(sql`(legacy_partner_id IS NOT NULL)`),
	index("idx_partner_meta_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.legacyMappedBy],
			foreignColumns: [profiles.id],
			name: "partner_meta_legacy_mapped_by_fkey"
		}),
	foreignKey({
			columns: [table.legacyPartnerId],
			foreignColumns: [partners.id],
			name: "partner_meta_legacy_partner_fk"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.profileId],
			foreignColumns: [profiles.id],
			name: "partner_meta_profile_id_fkey"
		}).onDelete("cascade"),
	check("partner_meta_status_check", sql`status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text])`),
	check("partner_meta_type_check", sql`type = ANY (ARRAY['freelancer'::text, 'business'::text])`),
]);

export const vimoStaff = pgTable("vimo_staff", {
	profileId: uuid("profile_id").primaryKey().notNull(),
	department: text(),
	position: text(),
	hireDate: date("hire_date"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.profileId],
			foreignColumns: [profiles.id],
			name: "vimo_staff_profile_id_fkey"
		}).onDelete("cascade"),
]);

export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	userType: text("user_type").default('staff').notNull(),
	name: text(),
	avatarUrl: text("avatar_url"),
	phone: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	email: text(),
	passwordHash: text("password_hash"),
}, (table) => [
	index("idx_profiles_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("ux_profiles_email_lower").using("btree", sql`lower(email)`).where(sql`(email IS NOT NULL)`),
	check("profiles_user_type_check", sql`user_type = ANY (ARRAY['staff'::text, 'partner'::text, 'external'::text])`),
]);

export const appAccess = pgTable("app_access", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	appCode: text("app_code").notNull(),
	role: text().default('member').notNull(),
	status: text().default('active').notNull(),
	joinedAt: timestamp("joined_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("app_access_erp_exclusive").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(app_code = ANY (ARRAY['vimo_erp'::text, 'partner_erp'::text]))`),
	index("idx_app_access_app_status").using("btree", table.appCode.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_app_access_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.appCode],
			foreignColumns: [apps.code],
			name: "app_access_app_code_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "app_access_user_id_fkey"
		}).onDelete("cascade"),
	unique("app_access_user_id_app_code_key").on(table.userId, table.appCode),
	check("app_access_status_check", sql`status = ANY (ARRAY['active'::text, 'suspended'::text])`),
]);

export const apps = pgTable("apps", {
	code: text().primaryKey().notNull(),
	name: text().notNull(),
	domain: text(),
	ssoEnabled: boolean("sso_enabled").default(true).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const partners = pgTable("partners", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text(),
	phone: text(),
	company: text(),
	partnerType: text("partner_type"),
	role: text().default('partner').notNull(),
	status: text().default('active').notNull(),
	generation: integer(),
	bank: text(),
	bankAccount: text("bank_account"),
	profileImage: text("profile_image"),
	kakaoChatId: text("kakao_chat_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	position: text().default('partner'),
	jobTitle: text("job_title"),
	jobRank: text("job_rank"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const projects = pgTable("projects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	client: text(),
	partnerId: text("partner_id"),
	status: text().default('planning').notNull(),
	totalAmount: numeric("total_amount").default('0'),
	partnerPayment: numeric("partner_payment").default('0'),
	managementFee: numeric("management_fee").default('0'),
	marginRate: numeric("margin_rate").default('0'),
	workContent: text("work_content").array(),
	tags: text().array(),
	thumbnailUrl: text("thumbnail_url"),
	videoUrl: text("video_url"),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	workTypeCosts: jsonb("work_type_costs"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	partnerIds: text("partner_ids").array().default([]),
	managerIds: text("manager_ids").array().default([]),
	category: text(),
	clientId: uuid("client_id"),
	channels: text().array(),
}, (table) => [
	index("idx_projects_client_id").using("btree", table.clientId.asc().nullsLast().op("uuid_ops")),
	index("idx_projects_client_name").using("btree", table.client.asc().nullsLast().op("text_ops")),
	index("idx_projects_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "projects_client_id_fkey"
		}),
]);

export const partnerHistory = pgTable("partner_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	partnerId: uuid("partner_id").notNull(),
	generation: integer().notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("partner_history_partner_id_idx").using("btree", table.partnerId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.partnerId],
			foreignColumns: [partners.id],
			name: "partner_history_partner_id_fkey"
		}).onDelete("cascade"),
]);

export const partnerIssues = pgTable("partner_issues", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	partnerId: uuid("partner_id").notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("partner_issues_partner_id_idx").using("btree", table.partnerId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.partnerId],
			foreignColumns: [partners.id],
			name: "partner_issues_partner_id_fkey"
		}).onDelete("cascade"),
]);

export const impersonationAudit = pgTable("impersonation_audit", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	adminId: uuid("admin_id").notNull(),
	targetProfileId: uuid("target_profile_id").notNull(),
	targetEmail: text("target_email"),
	reason: text(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const portfolioItems = pgTable("portfolio_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	client: text(),
	partnerId: text("partner_id"),
	completedAt: text("completed_at"),
	tags: text().array().default([]),
	youtubeUrl: text("youtube_url"),
	isPublished: boolean("is_published").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	category: text().default('기타'),
	displayOrder: integer("display_order").default(0),
});

export const userProfiles = pgTable("user_profiles", {
	id: uuid().primaryKey().notNull(),
	role: text().default('manager').notNull(),
	name: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	email: text(),
	approved: boolean().default(false),
	needsPasswordChange: boolean("needs_password_change").default(false),
	tutorialDone: jsonb("tutorial_done").default({}),
	passwordHash: text("password_hash"),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("ux_user_profiles_email_lower").using("btree", sql`lower(email)`).where(sql`(email IS NOT NULL)`),
]);
