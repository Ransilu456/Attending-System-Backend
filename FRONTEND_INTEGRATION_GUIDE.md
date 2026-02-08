# Frontend Integration Guide: Student Birthday Updates

This document outlines the changes made to the backend and how to use them in your frontend to update student birth dates.

## 1. Backend API Changes

### New Route
- **Method**: `PATCH`
- **URL**: `/api/admin/students/:id`
- **Authentication**: Required (Admin Token)
- **Validation**: Flexible (Allows partial updates)

### Example Payload
To update only the birth date:
```json
{
  "dateOfBirth": "2005-05-20"
}
```

## 2. Updated Student Data Structure

The `Student` model now uses `dateOfBirth` as the primary field. The `age` field is a **virtual property**, meaning:
- You **cannot** send `age` in a request.
- The backend will **automatically calculate** the age based on `dateOfBirth` whenever you fetch student data.

### Sample Response Data:
```json
{
  "_id": "68281cccda68a5832034cae8",
  "name": "R M Nethul Nethsara Rajapakshe",
  "indexNumber": "S1089",
  "dateOfBirth": "2000-01-01T00:00:00.000Z",
  "age": 26,
  ...
}
```

## 3. Recommended Frontend Action

You can create a "Complete Profile" or "Edit Birthday" page in your frontend that calls the new `PATCH` endpoint.

### Example Implementation (React/Vue/Etc.):

```javascript
const updateBirthday = async (studentId, dob) => {
  const response = await fetch(`${API_URL}/admin/students/${studentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ dateOfBirth: dob })
  });
  
  if (response.ok) {
    console.log('Birthday updated successfully');
  }
};
```

## 4. Current Database State

- **Placeholder Value**: All students previously missing birth dates have been assigned **2000-01-01** temporarily.
- **Affected Records**: 294 students.
- **Validation**: Attendance reports will now work without errors.

> [!IMPORTANT]
> Ensure your frontend date picker sends dates in the standard ISO format (e.g., `YYYY-MM-DD`).
