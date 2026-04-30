import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { prisma } from './db';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log('❌ Missing credentials');
          return null;
        }

        console.log('🔍 Attempting login for:', credentials.email);

        const user = await prisma.user.findFirst({
          where: { email: credentials.email },
          include: {
            organization: true,
            roleAssignments: true,  // Changed from 'roles'
          },
        });

        console.log('👤 User found:', user ? 'Yes' : 'No');
        
        if (user) {
          console.log('📧 Email match:', user.email);
          console.log('🔑 Has password:', user.hashedPassword ? 'Yes' : 'No');
          console.log('👔 Roles:', user.roleAssignments.map(r => r.role));
        }

        if (!user || !user.hashedPassword) {
          console.log('❌ User not found or no password');
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        );

        console.log('✅ Password valid:', isPasswordValid);

        if (!isPasswordValid) {
          console.log('❌ Password invalid');
          return null;
        }

        console.log('✨ Login successful for:', user.email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.orgId,
          roles: user.roleAssignments.map((r) => r.role),  // Map roleAssignments to roles
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.orgId = (user as any).orgId;
        token.roles = (user as any).roles;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).orgId = token.orgId;
        (session.user as any).roles = token.roles;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};