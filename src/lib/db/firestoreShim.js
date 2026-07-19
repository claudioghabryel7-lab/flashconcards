/**
 * Substitui 'firebase/firestore' via alias — delega para Firebase ou Supabase.
 * Importa o SDK real pelo caminho dist (evita alias circular com este arquivo).
 */
import * as firebaseFs from 'firebase/firestore-native'
import * as supabaseFs from '../supabase/firestoreAdapter.js'
import { useSupabaseBackend } from '../supabase/config.js'

function pick() {
  return useSupabaseBackend() ? supabaseFs : firebaseFs
}

export function getFirestore(app) {
  return useSupabaseBackend() ? supabaseFs.getFirestore() : firebaseFs.getFirestore(app)
}

export function collection(...args) {
  return pick().collection(...args)
}
export function doc(...args) {
  return pick().doc(...args)
}
export function getDoc(...args) {
  return pick().getDoc(...args)
}
export function setDoc(...args) {
  return pick().setDoc(...args)
}
export function updateDoc(...args) {
  return pick().updateDoc(...args)
}
export function addDoc(...args) {
  return pick().addDoc(...args)
}
export function deleteDoc(...args) {
  return pick().deleteDoc(...args)
}
export function getDocs(...args) {
  return pick().getDocs(...args)
}
export function onSnapshot(...args) {
  return pick().onSnapshot(...args)
}
export function query(...args) {
  return pick().query(...args)
}
export function where(...args) {
  return pick().where(...args)
}
export function orderBy(...args) {
  return pick().orderBy(...args)
}
export function limit(...args) {
  return pick().limit(...args)
}
export function serverTimestamp(...args) {
  return pick().serverTimestamp(...args)
}
export function arrayUnion(...args) {
  return pick().arrayUnion(...args)
}
export function arrayRemove(...args) {
  return pick().arrayRemove(...args)
}
export function increment(...args) {
  return pick().increment(...args)
}
export function writeBatch(...args) {
  return pick().writeBatch(...args)
}
export function getCountFromServer(...args) {
  return pick().getCountFromServer(...args)
}
export function documentId(...args) {
  return pick().documentId(...args)
}
export function collectionGroup(...args) {
  return pick().collectionGroup(...args)
}
export function runTransaction(...args) {
  return pick().runTransaction(...args)
}
export function deleteField(...args) {
  return pick().deleteField(...args)
}

export const Timestamp = supabaseFs.Timestamp
