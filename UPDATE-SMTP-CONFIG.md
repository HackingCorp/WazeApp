# SMTP Configuration Update - Action Required

## Changes Made

✅ **Mailserver Network Configuration**
- Connected `wazeapp-mailserver` container to `dokploy-network`
- Mailserver is now accessible to the backend service via Docker internal networking

## Environment Variables to Update in Dokploy

You need to update the following environment variables in the **backend** service in Dokploy:

### Previous Values:
```
SMTP_HOST=94.250.201.167
SMTP_PORT=3587
```

### New Values:
```
SMTP_HOST=wazeapp-mailserver
SMTP_PORT=587
```

## Why These Changes?

1. **SMTP_HOST**: Changed from IP address to container name because:
   - The mailserver container is now on the same Docker network (`dokploy-network`)
   - Using container name enables direct container-to-container communication
   - More reliable than using external IP address

2. **SMTP_PORT**: Changed from 3587 to 587 because:
   - Port 3587 is the **host-mapped** external port
   - Port 587 is the **container's internal** port
   - When communicating within Docker networks, use internal ports

## How to Update in Dokploy

1. Go to Dokploy dashboard: https://dokploy.wazeapp.xyz
2. Navigate to the **backend** service
3. Go to **Environment Variables** section
4. Update these two variables:
   - `SMTP_HOST` → `wazeapp-mailserver`
   - `SMTP_PORT` → `587`
5. Save and **redeploy** the backend service

## Verification

After redeploying, test the registration process:
1. Go to https://app.wazeapp.xyz/register
2. Fill in the registration form
3. Submit and check if the email is sent successfully
4. Check backend logs for SMTP connection success

## All SMTP Environment Variables

For reference, here are all SMTP-related environment variables that should be configured:

```
SMTP_HOST=wazeapp-mailserver
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@wazeapp.xyz
SMTP_PASS=/6vft3CdgBS56ou9hZftxt72jTfiFWts
SMTP_FROM=noreply@wazeapp.xyz
SMTP_FROM_NAME=WazeApp
```

## Next Steps

Once you've updated the environment variables and redeployed:
- Test registration with a real email address
- Verify that the verification email is received
- Check backend logs for any SMTP errors
