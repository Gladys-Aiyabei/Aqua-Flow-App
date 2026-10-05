# AquaFlow mobile app

Expo (SDK 57) React Native app for staff and customers. Full documentation: [../README.md](../README.md).

```bash
npm install
npx expo start --lan     # scan the QR code with Expo Go; press w for the browser
```

The API in `../server` must be running (`npm start` there). Staff PIN: `1234`.

| Folder | Contents |
|---|---|
| `App.js` | Sign-in gate, staff and customer tab layouts |
| `src/AppContext.js` | Session, live data polling, server address |
| `src/api.js` | HTTP client and default server address |
| `src/theme.js` | Colours, type and spacing from the Aquatic Precision design |
| `src/components/` | Shared UI (cards, buttons, sheets), tab bar, M-Pesa payment sheet |
| `src/screens/staff/` | Levels, Fleet, Store, M-Pesa, Reconcile, Feedback |
| `src/screens/customer/` | Shop, Tanker, My Orders, Feedback |
