-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create database for development (if not exists)
SELECT 'CREATE DATABASE wizeapp_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'wizeapp_dev')\gexec

-- Create database for testing (if not exists)  
SELECT 'CREATE DATABASE wizeapp_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'wizeapp_test')\gexec