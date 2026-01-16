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
      const issnFromCrossRef = info.ISSN ? info.ISSN[0] : null;

      // 3. Supabase JCR 테이블 조회
      // 컬럼명에 대문자가 포함되어 있으므로 따옴표 처리에 유의해야 합니다.
      const { data: jcrData, error: jcrError } = await supabase
        .from('jcr_impact_factors')
        .select('*') // 일단 전체 컬럼을 가져와서 매칭 확인
        .eq('ISSN', issnFromCrossRef) 
        .maybeSingle();

      if (jcrError) {
        console.error("JCR 조회 에러:", jcrError.message);
      }

      // 데이터 확인을 위한 로그 (브라우저 F12 콘솔에서 확인 가능)
      console.log("CrossRef ISSN:", issnFromCrossRef);
      console.log("DB에서 찾은 데이터:", jcrData);

      // 4. 결과 매칭 (DB 컬럼명과 정확히 일치해야 함)
      const impactFactor = jcrData && jcrData.IF ? String(jcrData.IF) : 'N/A';
      const journalName = jcrData && jcrData['Journal Title'] ? jcrData['Journal Title'] : info['container-title'][0];

      const newPaper = {
        doi,
        title: info.title[0],
        journal: journalName,
        year: info.created['date-parts'][0][0],
        impact_factor: impactFactor
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