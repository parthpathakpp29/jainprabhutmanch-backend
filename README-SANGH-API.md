# Hierarchical Sangh API Documentation

This document provides instructions for testing the Hierarchical Sangh API, which allows for the creation and management of Sanghs in a hierarchical structure (country > state > district > city).

## Prerequisites

1. MongoDB database connection
2. Node.js server running
3. Valid JWT token for authentication
4. Test files for document uploads

## Fix MongoDB Index Issue

Before testing, run the script to fix any index issues:

```bash
cd server
node scripts/fix-sangh-index.js
```

This script:
1. Drops the problematic unique index on `sanghAccessId`
2. Updates any records with undefined `sanghAccessId` to null
3. Creates a new sparse index on `sanghAccessId`

## API Endpoints

### Create a New Sangh

**Endpoint:** `POST /api/hierarchical-sangh/create`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
```

**Body (form-data):**

Basic Sangh Information:
- `name`: "MP Jain Sangh"
- `level`: "state"
- `parentSangh`: "67d25825512502f85d1d5661"
- `location[country]`: "India"
- `location[state]`: "Madhya Pradesh"

Office Bearers Information:
- `officeBearers[president][firstName]`: "Nitin"
- `officeBearers[president][lastName]`: "Jain"
- `officeBearers[president][jainAadharNumber]`: "JA47544533"
- `officeBearers[secretary][firstName]`: "Neha"
- `officeBearers[secretary][lastName]`: "Gupta"
- `officeBearers[secretary][jainAadharNumber]`: "JA63755096"
- `officeBearers[treasurer][firstName]`: "Rajesh"
- `officeBearers[treasurer][lastName]`: "Mehta"
- `officeBearers[treasurer][jainAadharNumber]`: "JA52356667"

Document Files:
- `presidentJainAadhar`: [Upload a PDF/image file]
- `presidentPhoto`: [Upload an image file]
- `secretaryJainAadhar`: [Upload a PDF/image file]
- `secretaryPhoto`: [Upload an image file]
- `treasurerJainAadhar`: [Upload a PDF/image file]
- `treasurerPhoto`: [Upload an image file]

**Example Response:**
```json
{
  "success": true,
  "message": "Sangh created successfully with access",
  "data": {
    "sangh": {
      "_id": "...",
      "name": "MP Jain Sangh",
      "level": "state",
      "location": {
        "country": "India",
        "state": "Madhya Pradesh"
      },
      "officeBearers": [...],
      "members": [],
      "status": "active",
      "createdAt": "...",
      "updatedAt": "..."
    },
    "accessId": "ST-XXXXXX-XXXXXX",
    "sanghAccessId": "...",
    "sanghAccessCode": "..."
  },
  "statusCode": 201
}
```

### Get Sangh Hierarchy

**Endpoint:** `GET /api/hierarchical-sangh/hierarchy/:id`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
```

### Get Sanghs by Level and Location

**Endpoint:** `GET /api/hierarchical-sangh/search?level=state&country=India&state=Madhya%20Pradesh`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
```

### Get Child Sanghs

**Endpoint:** `GET /api/hierarchical-sangh/children/:id`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
```

## Troubleshooting

### Common Errors

1. **Missing Documents Error:**
   - Error: `Missing required documents: [list of missing documents]`
   - Solution: Ensure all six document files are included

2. **Office Bearer Validation Error:**
   - Error: `[role]'s Jain Aadhar is not verified`
   - Solution: Use Jain Aadhar numbers of verified users

3. **Duplicate Office Bearer Error:**
   - Error: `[role] is already an office bearer in another Sangh`
   - Solution: Use different office bearers who aren't assigned elsewhere

4. **Hierarchy Validation Error:**
   - Error: `Invalid hierarchy: state level cannot be under [level] level`
   - Solution: Ensure parent Sangh is a country-level Sangh

5. **Location Validation Error:**
   - Error: `State must belong to the parent country`
   - Solution: Ensure location hierarchy is correct

6. **Duplicate Key Error:**
   - Error: `E11000 duplicate key error collection: development.hierarchicalsanghs index: sanghAccessId_1 dup key: { sanghAccessId: null }`
   - Solution: Run the fix-sangh-index.js script

## Testing with Postman

1. Create a new request in Postman
2. Set the method to POST
3. Enter the URL: `http://localhost:4000/api/hierarchical-sangh/create`
4. Add the Authorization header with your JWT token
5. In the Body tab, select "form-data" and add all the required fields
6. For file fields, select "File" from the dropdown and choose appropriate files
7. Click "Send" to submit the request 