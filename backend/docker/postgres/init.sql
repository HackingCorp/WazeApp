-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create database for development (if not exists)
SELECT 'CREATE DATABASE wazeapp_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'wazeapp_dev')\gexec

-- Create database for testing (if not exists)  
SELECT 'CREATE DATABASE wazeapp_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'wazeapp_test')\gexec