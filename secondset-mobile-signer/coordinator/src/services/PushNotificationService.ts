export class PushNotificationService {
  async sendNotification(pushToken: string, notification: any) {
    console.log('Push notification:', pushToken, notification);
    // TODO: Implement APNs/FCM
  }
}