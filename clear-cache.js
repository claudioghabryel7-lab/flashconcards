// Script para limpar cache e forçar atualização
// Execute no terminal: node clear-cache.js

const fs = require('fs')
const path = require('path')

console.log('🧹 Limpando cache do projeto...')

// Limpar pasta .vite (cache do Vite)
const viteCachePath = path.join(__dirname, '.vite')
if (fs.existsSync(viteCachePath)) {
  try {
    fs.rmSync(viteCachePath, { recursive: true, force: true })
    console.log('✅ Cache .vite removido')
  } catch (err) {
    console.log('❌ Erro ao remover .vite:', err.message)
  }
}

// Limpar pasta node_modules/.cache
const nodeModulesCachePath = path.join(__dirname, 'node_modules', '.cache')
if (fs.existsSync(nodeModulesCachePath)) {
  try {
    fs.rmSync(nodeModulesCachePath, { recursive: true, force: true })
    console.log('✅ Cache node_modules/.cache removido')
  } catch (err) {
    console.log('❌ Erro ao remover node_modules/.cache:', err.message)
  }
}

// Limpar package-lock.json para forçar reinstalação
const packageLockPath = path.join(__dirname, 'package-lock.json')
if (fs.existsSync(packageLockPath)) {
  try {
    fs.unlinkSync(packageLockPath)
    console.log('✅ package-lock.json removido')
  } catch (err) {
    console.log('❌ Erro ao remover package-lock.json:', err.message)
  }
}

console.log('\n🚀 Execute os seguintes comandos:')
console.log('1. npm install')
console.log('2. npm run dev')
console.log('\n💡 Isso vai garantir que todas as alterações sejam aplicadas!')
