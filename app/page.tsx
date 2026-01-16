'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Vercel에 설정한 환경변수를 자동으로 가져옵니다.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PaperManager() {
  const [doi, setDoi] = useState('');
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 1. 페이지 로드 시 저장된 논문 목록 가져오기
  useEffect(() => {
    fetchSavedPapers();
  }, []);

  const fetchSavedPapers = async () => {
    const { data } = await supabase.from('papers').select('*').order('created_at', { ascending: false });
    if (data) setPapers(data);
  };

  const addPaper = async () => {
    if (!doi) return alert('DOI를 입력하세요!');
    setLoading(true);

    try {
      // 2. CrossRef API로 논문 기본 정보 가져오기
      const res = await fetch(`https://api.crossref.org/works/${doi}`);
      const data = await res.json();
      const info = data.message;
      const issn = info.ISSN ? info.ISSN[0] : null;

      // 3. Supabase JCR 테이블에서 IF 매칭하기
      // 주의: 컬럼명이 "ISSN" (대문자), "IF" (대문자), "Journal Title" (공백 포함) 임에 유의하세요.
      const { data: jcrData, error: jcrError } = await supabase
        .from('jcr_impact_factors')
        .select('"IF", "Journal Title"') // 공백이 있는 경우 따옴표로 감싸는 것이 안전합니다.
        .eq('ISSN', issn) // CrossRef에서 가져온 ISSN과 매칭
        .limit(1) // 동일 ISSN에 여러 카테고리가 있을 수 있으므로 하나만 가져옵니다.
        .maybeSingle(); // 결과가 없어도 에러(빨간색 로그)를 내지 않고 null을 반환합니다.

      if (jcrError) console.log("JCR 매칭 실패:", jcrError.message);

      const newPaper = {
        doi,
        title: info.title[0],
        // JCR에 정보가 있으면 JCR의 공식 명칭을, 없으면 CrossRef 명칭 사용
        journal: jcrData?.['Journal Title'] || info['container-title'][0],
        year: info.created['date-parts'][0][0],
        impact_factor: jcrData?.IF ? jcrData.IF.toFixed(3) : 'N/A' // real 타입을 소수점 3자리까지 표시
      };

      // 4. 결과 DB에 저장하기
      const { error } = await supabase.from('papers').insert([newPaper]);
      if (error) throw error;

      alert('성공적으로 등록되었습니다!');
      setDoi('');
      fetchSavedPapers(); // 목록 새로고침
    } catch (err) {
      console.error(err);
      alert('정보를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-10 max-w-5xl mx-auto text-black">
      <h1 className="text-3xl font-bold mb-8">CIDA Lab 연구성과 관리</h1>
      
      <div className="flex gap-2 mb-10">
        <input 
          className="flex-1 border p-3 rounded"
          placeholder="DOI를 입력하세요 (예: 10.1038/s41586-020-2012-7)"
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
        />
        <button onClick={addPaper} disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded font-bold">
          {loading ? '처리 중...' : '등록'}
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4">연도</th>
              <th className="p-4">논문 제목</th>
              <th className="p-4">저널/학회</th>
              <th className="p-4">IF</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((p, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="p-4">{p.year}</td>
                <td className="p-4 font-semibold">{p.title}</td>
                <td className="p-4">{p.journal}</td>
                <td className="p-4 text-blue-600 font-bold">{p.impact_factor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}