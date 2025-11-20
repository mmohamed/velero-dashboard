# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2023-12-03

### Added

- Add Sanitazing for XSS protection
- Add CSRF Token security check
- Add Secure cookie support

### Removed

- Remove CORS mode
- Remove X-POWERED header

## [1.1.3] - 2023-12-01

### Added

- Multi (Remote) Cluster mode
- CirculeCI configuration
- Debug logs
- GIP support

### Fixed

- Fix relative paths (#4)
- Fix logs timestamp
- Fix read only mode view
- Fix CaCert for of Backup Storage location

### Changed

- Upgrade dependencies: @kubernetes/client-node from 0.19.0 to 0.20.0

## [1.2.0] - 2025-01-10

### Added

- Full Rest API support V1 (swagger doc)

## [1.2.1] - 2025-01-30

### Fixed

- Fix security issues
- Fix the swagger doc API

## [1.2.2] - 2025-02-07

### Added

- Add SSL support for API backend

## [1.2.3] - 2025-11-20

### Fixed

- Fix LDAP authentication with password or username contains special characters 
