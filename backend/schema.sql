CREATE TABLE users (
	id VARCHAR(50) NOT NULL, 
	email VARCHAR(100) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	password VARCHAR(255) NOT NULL, 
	`role` VARCHAR(50) NOT NULL, 
	department VARCHAR(100) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);

CREATE TABLE documents (
	id VARCHAR(50) NOT NULL, 
	source VARCHAR(50), 
	filename VARCHAR(255), 
	upload_time DATETIME, 
	cleared_at DATETIME, 
	expires_at DATETIME, 
	till_date DATE, 
	is_duplicate BOOL, 
	is_revalidate BOOL, 
	duplicate_info JSON, 
	status VARCHAR(50), 
	attachments JSON, 
	uploaded_by VARCHAR(100), 
	hold_since DATETIME,
	comments TEXT,
	is_partial BOOLEAN DEFAULT 0,
	screening_date DATE, 
	dr_ccy VARCHAR(10), 
	amount FLOAT, 
	portal_ref_no VARCHAR(100), 
	product VARCHAR(50), 
	bl_number VARCHAR(100), 
	is_master BOOL, 
	fields JSON, 
	last_edited_by VARCHAR(100), 
	last_edited_at DATETIME, 
	rejected_by VARCHAR(100), 
	rejected_at DATETIME, 
	reject_reason TEXT, 
	PRIMARY KEY (id)
);

CREATE TABLE duplicate_logs (
	id VARCHAR(50) NOT NULL, 
	doc_id VARCHAR(50), 
	original_doc_id VARCHAR(50), 
	document_type VARCHAR(50), 
	bl_number VARCHAR(100), 
	matched_on JSON, 
	matched_values JSON, 
	detected_at DATETIME, 
	severity VARCHAR(50), 
	duplicate_type VARCHAR(50), 
	uploaded_by VARCHAR(100), 
	PRIMARY KEY (id)
);

CREATE TABLE notifications (
	id VARCHAR(50) NOT NULL, 
	type VARCHAR(50), 
	title VARCHAR(255), 
	message TEXT, 
	doc_id VARCHAR(50), 
	severity VARCHAR(50), 
	created_at DATETIME, 
	`read` BOOL, 
	read_at DATETIME, 
	PRIMARY KEY (id)
);

CREATE TABLE audit_logs (
	id VARCHAR(50) NOT NULL, 
	action VARCHAR(100), 
	doc_id VARCHAR(50), 
	doc_type VARCHAR(50), 
	bl_number VARCHAR(100), 
	is_duplicate BOOL, 
	is_revalidate BOOL, 
	timestamp DATETIME, 
	user_email VARCHAR(100), 
	filename VARCHAR(255), 
	PRIMARY KEY (id)
);
