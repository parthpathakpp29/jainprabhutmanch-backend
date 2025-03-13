# Jain Prabhu API Documentation

## Base URL
```
http://localhost:4000/api
```

## Authentication
All protected routes require a valid JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## User Registration & Authentication

### Register User
```http
POST /user/register
```

**Request Body:**
```json
{
  "firstName": "string (2-30 chars)",
  "lastName": "string (2-30 chars)",
  "phoneNumber": "string (10 digits)",
  "password": "string (min 8 chars)",
  "birthDate": "ISO8601 date",
  "gender": "Male | Female | Other",
  "city": "string",
  "state": "string (optional)",
  "district": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "firstName": "string",
      "lastName": "string",
      "fullName": "string",
      "phoneNumber": "string",
      "birthDate": "ISO8601 date",
      "gender": "string",
      "city": "string",
      "state": "string",
      "district": "string",
      "accountStatus": "active",
      "registrationStep": "initial",
      "lastLogin": "ISO8601 date"
    },
    "token": "string",
    "nextStep": "profile_picture"
  },
  "message": "User registered successfully"
}
```

**Notes:**
- Name formatting: If lastName is "jain", fullName = "firstName Jain", else fullName = "firstName Jain (lastName)"
- Registration is a multi-step process
- Initial registration provides a 1-month trial period
- Jain membership verification required for full access

### Login
```http
POST /user/login
```

**Request Body:**
```json
{
  "fullName": "string",
  "password": "string"
}
```

**Security Features:**
- Rate limiting: 5 attempts per 15 minutes
- Case-insensitive name matching
- Secure token generation
- Password hashing and validation

### User Search
```http
GET /user/users
```
*Requires Authentication*

**Query Parameters:**
```
search: string (optional) - Search in firstName, lastName, fullName
page: number (default: 1)
limit: number (default: 10)
city: string (optional)
state: string (optional)
district: string (optional)
gender: string (optional)
```

### Get User Profile
```http
GET /user/:id
```
*Requires Authentication*

**Response includes:**
- Basic user information
- Posts (sorted by creation date)
- Stories
- Post count
- Verification status

### Membership System

#### Trial Period
- Duration: 1 month from registration
- Available features:
  - Basic profile access
  - Limited social features
  - View public Sangha information

#### Verified Status
- Requirements:
  - Valid Jain Aadhar documentation
  - Profile completion
  - Verification by Sangha officials
- Additional features:
  - Full social features access
  - Sangha membership eligibility
  - Office bearer eligibility
  - Access to restricted content

#### Account States
- `initial`: Just registered
- `active`: Regular user
- `verified`: Verified Jain member
- `trial`: In trial period
- `suspended`: Account suspended
- `expired`: Trial expired

### Rate Limiting
- Login: 5 attempts per 15 minutes
- Registration: 3 attempts per hour
- API calls: Varies by endpoint

## Sangha Management System

### Create New Sangha
```http
POST /hierarchical-sangh/create
```
*Requires Authentication + Creation Permission*

**Request Body:**
```json
{
  "name": "string (required)",
  "level": "city | district | state | country",
  "location": {
    "country": "string",
    "state": "string",
    "district": "string",
    "city": "string"
  },
  "parentSangh": "ObjectId (required except for country level)",
  "description": "string (optional)",
  "contact": {
    "email": "string (optional)",
    "phone": "string (optional)",
    "address": "string (optional)"
  },
  "socialMedia": {
    "facebook": "string (optional)",
    "twitter": "string (optional)",
    "instagram": "string (optional)",
    "website": "string (optional)"
  },
  "officeBearers": [{
    "role": "president | secretary | treasurer",
    "userId": "ObjectId (required)",
    "firstName": "string (required)",
    "lastName": "string (required)",
    "name": "string (required)",
    "jainAadharNumber": "string (required)",
    "document": "string (required)",
    "photo": "string (required)"
  }]
}
```

**Notes:**
- Hierarchy validation ensures proper parent-child relationships
- Country level cannot have a parent Sangh
- Each level must have a parent of immediate higher level (e.g., city under district)
- System automatically generates a unique access ID for each Sangh

### Get Sangha Hierarchy
```http
GET /hierarchical-sangh/hierarchy/:id
```
*Requires Authentication + Sangha Access*

### Search Sanghas
```http
GET /hierarchical-sangh/search
```
*Requires Authentication*

**Query Parameters:**
- `level`: city | district | state | country
- `city`: string (optional)
- `district`: string (optional)
- `state`: string (optional)

### Get Child Sanghas
```http
GET /hierarchical-sangh/children/:id
```
*Requires Authentication + Sangha Access*

### Update Sangha
```http
PATCH /hierarchical-sangh/update/:id
```
*Requires Authentication + Office Bearer Permission*

**Request Body:** (All fields optional)
```json
{
  "name": "string",
  "officeBearers": [{
    "role": "president | secretary | treasurer",
    "userId": "ObjectId",
    "firstName": "string",
    "lastName": "string",
    "name": "string",
    "jainAadharNumber": "string",
    "document": "string",
    "photo": "string"
  }]
}
```

## Sangha Access System

### Access ID Format
Each Sangha is assigned a unique access ID with the following format:
```
[Level Prefix]-[Timestamp]-[Random]
```
Where:
- Level Prefix: CNT (Country), ST (State), DST (District), CTY (City)
- Timestamp: 6-digit timestamp
- Random: 6-character hexadecimal

### Location Validation Rules
Location fields are required based on Sangha level:
- Country: requires `country`
- State: requires `country`, `state`
- District: requires `country`, `state`, `district`
- City: requires `country`, `state`, `district`, `city`

### Hierarchy Validation
The system enforces strict hierarchical relationships:
1. Location Hierarchy:
   - States must belong to their parent country
   - Districts must belong to their parent state
   - Cities must belong to their parent district

2. Level Hierarchy:
   - Lower levels cannot be created under same or lower levels
   - Each level must have an immediate parent (except country)
   - Proper chain: Country → State → District → City

### Access Control System
```http
GET /sangh-access/validate/:accessId
```
*Requires Authentication*

**Response:**
```json
{
  "success": true,
  "data": {
    "accessId": "string",
    "level": "country | state | district | city",
    "location": {
      "country": "string",
      "state": "string",
      "district": "string",
      "city": "string"
    },
    "status": "active | inactive",
    "lastAccessed": "ISO8601 date"
  }
}
```

### Access Tracking
- System maintains last access timestamp
- Access status can be active/inactive
- Parent-child access relationships are tracked
- Access can be revoked at any level

## Sangha Membership Management

### Add Member
```http
POST /hierarchical-sangh/:sanghId/members
```
*Requires Authentication + Office Bearer Permission*

**Request Body:**
```json
{
  "userId": "ObjectId (required)",
  "firstName": "string (required)",
  "lastName": "string (required)",
  "name": "string (required)",
  "jainAadharNumber": "string (required)",
  "email": "string (optional)",
  "phoneNumber": "string (optional)",
  "address": {
    "street": "string (optional)",
    "city": "string (optional)",
    "district": "string (optional)",
    "state": "string (optional)",
    "pincode": "string (optional)"
  }
}
```

**Form Data:**
- `memberJainAadhar`: File (required) - Member's Jain Aadhar document
- `memberPhoto`: File (required) - Member's photo

### Remove Member
```http
DELETE /hierarchical-sangh/:sanghId/members/:memberId
```
*Requires Authentication + Office Bearer Permission*

### Update Member Details
```http
PUT /hierarchical-sangh/:sanghId/members/:memberId
```
*Requires Authentication + Office Bearer Permission*

### Get Sangha Members
```http
GET /hierarchical-sangh/:sanghId/members
```
*Requires Authentication + Sangha Access*

## Access Control

### Role Hierarchy
1. Super Admin: Full system access
2. Office Bearers:
   - President: Can create lower-level Sanghas, manage members
   - Secretary: Can manage members and Sangha information
   - Treasurer: Can manage financial aspects
3. Regular Members: View access to Sangha information

### Permissions
- Super Admins can create and manage any level Sangha
- Country-level presidents can create state-level Sanghas
- State-level office bearers can create district-level Sanghas
- District-level office bearers can create city-level Sanghas
- Office bearers can:
  - Manage their Sangha's members
  - Update Sangha information
  - View hierarchy and child Sanghas
- Members can:
  - View their Sangha's information
  - View parent and child Sangha details
  - Access public Sangha information

### Membership Verification
- All members must provide valid Jain Aadhar documentation
- New members get a 1-month trial period if unverified
- Verification status affects access to certain features
- Office bearers must be verified members

## Error Handling

### Validation Errors
```json
{
  "success": false,
  "message": "Validation Error",
  "errors": {
    "location": ["Missing required location fields: district, city"],
    "hierarchy": ["City level cannot be created under district level"],
    "access": ["Invalid access ID or expired access"]
  }
}
```

### Common Error Scenarios
1. Location Hierarchy:
   - Attempting to create state under wrong country
   - Attempting to create district under wrong state
   - Attempting to create city under wrong district

2. Access Control:
   - Invalid or expired access ID
   - Insufficient permissions for operation
   - Attempting to modify higher level Sangha
   - Attempting to create Sangha at invalid level

3. Member Management:
   - Invalid Jain Aadhar verification
   - Expired trial period
   - Insufficient office bearer permissions

### HTTP Status Codes
- 400: Bad Request (Validation Errors)
- 401: Unauthorized (Invalid/Missing Token)
- 403: Forbidden (Insufficient Permissions)
- 404: Not Found (Invalid Sangha/Access ID)
- 409: Conflict (Hierarchy Violation)
- 500: Internal Server Error

## Best Practices
1. Always validate access IDs before operations
2. Check parent Sangha existence and validity
3. Verify location hierarchy matches parent
4. Ensure proper office bearer permissions
5. Validate member documentation before adding
6. Keep track of trial period expiration
7. Handle access revocation gracefully

## Error Responses
All endpoints return errors in the following format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (if available)"
}
```

Common HTTP Status Codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error
